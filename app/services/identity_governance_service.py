from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from flask import current_app

from app.services.account_job_service import (
    VALID_ACTIONS as ACCOUNT_JOB_VALID_ACTIONS,
    approve_account_job,
    create_account_job,
)

logger = logging.getLogger(__name__)

USER_TABLE = 'identity_user'
ADMIN_TABLE = 'identity_admin'
ADMIN_USER_TABLE = 'identity_admin_user_mapping'
INTEGRATED_TABLE = 'identity_integrated_account'
SOURCE_TABLE = 'identity_source_account'
ACCOUNT_MAPPING_TABLE = 'identity_account_mapping'
REQUEST_TABLE = 'identity_account_request'
TASK_TABLE = 'identity_request_manual_task'
ATTACHMENT_TABLE = 'identity_request_attachment'
WORKFLOW_EVENT_TABLE = 'identity_request_workflow_event'
AUDIT_TABLE = 'identity_audit_log'
AD_GROUP_TABLE = 'identity_ad_group'
AD_GROUP_MAPPING_TABLE = 'identity_ad_group_mapping'
ACCESS_REVIEW_TABLE = 'identity_access_review'
ACCESS_REVIEW_ITEM_TABLE = 'identity_access_review_item'

ACCOUNT_TYPES = ('PERSONAL', 'SERVICE')
OWNER_TYPES = ('USER', 'ADMIN')
ACCOUNT_STATUSES = ('ACTIVE', 'INACTIVE')
COLLECTION_TYPES = ('AUTO', 'MANUAL')
REQUEST_STATUS_SUBMITTED = '신청'
REQUEST_STATUS_PENDING = '승인대기'
REQUEST_STATUS_OPS_PENDING = '운영팀 승인대기'
REQUEST_STATUS_APPROVED = '승인'
REQUEST_STATUS_REJECTED = '반려'
REQUEST_STATUS_PROCESSING = '처리중'

INTEGRATION_INTEGRATED = 'INTEGRATED'
INTEGRATION_NON_INTEGRATED = 'NON_INTEGRATED'
INTEGRATION_AD = 'AD'

WORKFLOW_REQUESTED = 'REQUESTED'
WORKFLOW_OPS_PENDING = 'OPS_PENDING'
WORKFLOW_ASSIGNED = 'ASSIGNED'
WORKFLOW_IN_PROGRESS = 'IN_PROGRESS'
WORKFLOW_EVIDENCE_UPLOADED = 'EVIDENCE_UPLOADED'
WORKFLOW_COMPLETED = 'COMPLETED'
WORKFLOW_REJECTED = 'REJECTED'
WORKFLOW_FAILED = 'FAILED'

WORKFLOW_LABEL_KO = {
    WORKFLOW_REQUESTED: '신청',
    WORKFLOW_OPS_PENDING: '운영 승인 대기',
    WORKFLOW_ASSIGNED: '담당 지정됨',
    WORKFLOW_IN_PROGRESS: '작업 진행',
    WORKFLOW_EVIDENCE_UPLOADED: '증적 제출',
    WORKFLOW_COMPLETED: '완료',
    WORKFLOW_REJECTED: '반려',
    WORKFLOW_FAILED: '실패',
}

DEFAULT_OPERATION_INTEGRATED = 'INTEGRATED_ACCOUNT_BIND'


def _workflow_from_legacy_status(status: str) -> str:
    if status == REQUEST_STATUS_PENDING:
        return WORKFLOW_REQUESTED
    if status == REQUEST_STATUS_OPS_PENDING:
        return WORKFLOW_OPS_PENDING
    if status == REQUEST_STATUS_APPROVED:
        return WORKFLOW_COMPLETED
    if status == REQUEST_STATUS_REJECTED:
        return WORKFLOW_REJECTED
    if status == REQUEST_STATUS_PROCESSING:
        return WORKFLOW_ASSIGNED
    return WORKFLOW_REQUESTED


def _migrate_identity_request_extensions(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, REQUEST_TABLE):
        return
    cols = _columns(conn, REQUEST_TABLE)
    additions = [
        ('public_id', 'TEXT'),
        ('integration_type', "TEXT DEFAULT 'INTEGRATED'"),
        ('operation_type', "TEXT DEFAULT 'INTEGRATED_ACCOUNT_BIND'"),
        ('workflow_status', 'TEXT'),
        ('agent_pending_id', 'INTEGER'),
        ('agent_job_request_id', 'TEXT'),
        ('manual_system_name', 'TEXT'),
        ('access_method', 'TEXT'),
        ('location_detail', 'TEXT'),
        ('manual_guide', 'TEXT'),
        ('operator_org_user_id', 'INTEGER'),
        ('valid_from', 'TEXT'),
        ('valid_until', 'TEXT'),
        ('is_emergency', 'INTEGER NOT NULL DEFAULT 0'),
        ('extension_json', "TEXT DEFAULT '{}'"),
        ('failure_reason', 'TEXT'),
    ]
    for name, decl in additions:
        if name not in cols:
            conn.execute(f'ALTER TABLE {REQUEST_TABLE} ADD COLUMN {name} {decl}')

    conn.execute(
        f'''
        CREATE TABLE IF NOT EXISTS {TASK_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            assignee_org_user_id INTEGER,
            status TEXT NOT NULL DEFAULT 'OPEN',
            title TEXT,
            instruction TEXT,
            due_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (request_id) REFERENCES {REQUEST_TABLE}(id) ON DELETE CASCADE
        )
        '''
    )
    conn.execute(
        f'CREATE INDEX IF NOT EXISTS idx_{TASK_TABLE}_request ON {TASK_TABLE}(request_id)'
    )
    conn.execute(
        f'''
        CREATE TABLE IF NOT EXISTS {ATTACHMENT_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            task_id INTEGER,
            kind TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            filename TEXT,
            mime TEXT,
            size_bytes INTEGER,
            uploaded_by TEXT,
            uploaded_at TEXT NOT NULL,
            FOREIGN KEY (request_id) REFERENCES {REQUEST_TABLE}(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES {TASK_TABLE}(id) ON DELETE SET NULL
        )
        '''
    )
    conn.execute(
        f'CREATE INDEX IF NOT EXISTS idx_{ATTACHMENT_TABLE}_request ON {ATTACHMENT_TABLE}(request_id)'
    )
    conn.execute(
        f'''
        CREATE TABLE IF NOT EXISTS {WORKFLOW_EVENT_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            actor TEXT,
            payload_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (request_id) REFERENCES {REQUEST_TABLE}(id) ON DELETE CASCADE
        )
        '''
    )
    conn.execute(
        f'CREATE INDEX IF NOT EXISTS idx_{WORKFLOW_EVENT_TABLE}_request ON {WORKFLOW_EVENT_TABLE}(request_id)'
    )

    blanks = conn.execute(
        f"SELECT id FROM {REQUEST_TABLE} WHERE public_id IS NULL OR trim(public_id) = ''",
    ).fetchall()
    for r in blanks:
        conn.execute(
            f'UPDATE {REQUEST_TABLE} SET public_id = ? WHERE id = ?',
            (str(uuid.uuid4()), int(r['id'])),
        )

    ambiguous = conn.execute(
        f'''
        SELECT id FROM {REQUEST_TABLE}
         WHERE workflow_status IS NULL OR trim(workflow_status) = ''
        '''
    ).fetchall()
    for r in ambiguous:
        st_row = conn.execute(
            f'SELECT status FROM {REQUEST_TABLE} WHERE id = ?',
            (int(r['id']),),
        ).fetchone()
        if st_row:
            wf = _workflow_from_legacy_status(st_row['status'] or '')
            conn.execute(
                f'UPDATE {REQUEST_TABLE} SET workflow_status = ? WHERE id = ?',
                (wf, int(r['id'])),
            )

    if 'agent_job_request_id' in _columns(conn, REQUEST_TABLE):
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{REQUEST_TABLE}_agent_job ON {REQUEST_TABLE}(agent_job_request_id)'
        )

SYSTEM_TYPE_LABELS = {
    'SERVER': 'SERVER',
    'STORAGE': 'STORAGE',
    'SAN': 'SAN',
    'NETWORK': '네트워크',
    'SECURITY': '보안장비',
    'WEB': 'WEB',
    'VPN': 'VPN',
    'SOLUTION': '솔루션',
    'AD': 'AD',
}


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('IDENTITY_GOVERNANCE_SQLITE_PATH')
    if override:
        return os.path.abspath(override)

    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dev_blossom.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    if netloc and netloc not in ('', 'localhost'):
        path = f'//{netloc}{path}'

    if os.name == 'nt' and path.startswith('/') and not path.startswith('//'):
        if len(path) >= 4 and path[1].isalpha() and path[2] == ':' and path[3] == '/':
            path = path[1:]

    relative = path.lstrip('/')
    if relative and not os.path.isabs(relative):
        if os.path.basename(relative) == relative:
            return os.path.abspath(os.path.join(app.instance_path, relative))
        return os.path.abspath(os.path.join(_project_root(app), relative))
    if os.path.isabs(path):
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, 'dev_blossom.db'))


def _get_connection(app=None) -> sqlite3.Connection:
    path = _resolve_db_path(app)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
        (table_name,),
    ).fetchone()
    return bool(row)


def _columns(conn: sqlite3.Connection, table_name: str) -> set:
    try:
        return {str(row['name']) for row in conn.execute(f'PRAGMA table_info({table_name})').fetchall()}
    except Exception:
        return set()


def _as_int(value: Any) -> Optional[int]:
    try:
        if value is None or value == '':
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _text(value: Any, max_len: int = 255) -> str:
    value = '' if value is None else str(value)
    value = value.strip()
    if max_len and len(value) > max_len:
        return value[:max_len]
    return value


def _normalize_account_type(value: Any) -> str:
    raw = _text(value, 20).upper()
    if raw in ('개인', 'PERSON', 'USER'):
        raw = 'PERSONAL'
    if raw in ('서비스', 'SYSTEM', 'ADMIN'):
        raw = 'SERVICE'
    if raw not in ACCOUNT_TYPES:
        raise ValueError('계정 유형은 PERSONAL 또는 SERVICE만 사용할 수 있습니다.')
    return raw


def _normalize_owner_type(value: Any) -> str:
    raw = _text(value, 20).upper()
    if raw not in OWNER_TYPES:
        raise ValueError('소유자 유형은 USER 또는 ADMIN만 사용할 수 있습니다.')
    return raw


def _normalize_status(value: Any, default: str = 'ACTIVE') -> str:
    raw = _text(value or default, 20).upper()
    if raw in ('정상', '사용', '사용중'):
        raw = 'ACTIVE'
    if raw in ('비활성', '중지', '차단'):
        raw = 'INACTIVE'
    return raw if raw in ACCOUNT_STATUSES else default


def _normalize_collection_type(value: Any) -> str:
    raw = _text(value or 'MANUAL', 20).upper()
    if raw in ('자동', 'AUTO'):
        return 'AUTO'
    return 'MANUAL'


def _normalize_system_type(value: Any) -> str:
    raw = _text(value or 'SOLUTION', 40).upper()
    aliases = {
        '서버': 'SERVER',
        '스토리지': 'STORAGE',
        '네트워크': 'NETWORK',
        '보안': 'SECURITY',
        '보안장비': 'SECURITY',
        '웹': 'WEB',
        '솔루션': 'SOLUTION',
    }
    return aliases.get(raw, raw)


def _normalize_integration_type(value: Any) -> str:
    raw = _text(value or INTEGRATION_INTEGRATED, 32).upper()
    if raw in ('LINKED', 'AUTO', 'AGENT', '연동'):
        raw = INTEGRATION_INTEGRATED
    if raw in ('MANUAL', 'NON_LINKED', 'NON_INTEGRATED', '미연동'):
        raw = INTEGRATION_NON_INTEGRATED
    if raw in ('ACTIVE_DIRECTORY',):
        raw = INTEGRATION_AD
    if raw not in (INTEGRATION_INTEGRATED, INTEGRATION_NON_INTEGRATED, INTEGRATION_AD):
        raise ValueError('신청 유형은 INTEGRATED, NON_INTEGRATED, AD 중 하나여야 합니다.')
    return raw


def _normalize_operation_type(value: Any) -> str:
    return _text(value or DEFAULT_OPERATION_INTEGRATED, 80).upper()


def _append_workflow_event(
    conn: sqlite3.Connection,
    request_id: int,
    event_type: str,
    actor: str,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    conn.execute(
        f'''INSERT INTO {WORKFLOW_EVENT_TABLE} (request_id, event_type, actor, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)''',
        (
            int(request_id),
            _text(event_type, 64),
            _text(actor, 120),
            json.dumps(payload or {}, ensure_ascii=False),
            _now(),
        ),
    )


def _as_job_agent_id(row: sqlite3.Row) -> Optional[int]:
    """Best-effort extract agent_pending_id from row/extension_json."""
    try:
        raw = row['agent_pending_id']
    except Exception:
        raw = None
    aid = _as_int(raw)
    if aid:
        return aid
    try:
        ext = json.loads((row['extension_json'] or '{}') if 'extension_json' in dict(row) else '{}')
    except Exception:
        ext = {}
    return _as_int(ext.get('agent_pending_id') or ext.get('agent_id'))


def _op_to_account_job_action(operation_type: str) -> Optional[str]:
    op = _text(operation_type, 80).upper()
    if not op:
        return None
    # allow direct pass-through if it matches
    if op in ACCOUNT_JOB_VALID_ACTIONS:
        return op
    aliases = {
        'ACCOUNT_CREATE': 'CREATE_USER',
        'ACCOUNT_DELETE': 'DELETE_USER',
        'ACCOUNT_LOCK': 'LOCK_USER',
        'ACCOUNT_UNLOCK': 'UNLOCK_USER',
        'PASSWORD_CHANGE': 'CHANGE_PASSWORD',
        'PASSWORD_RESET': 'EXPIRE_PASSWORD',
        'ROLE_ADD': 'ADD_GROUP_MEMBER',
        'ROLE_REMOVE': 'REMOVE_GROUP_MEMBER',
    }
    mapped = aliases.get(op)
    return mapped if mapped in ACCOUNT_JOB_VALID_ACTIONS else None


def bootstrap_integrated_operations_requiring_agent() -> List[str]:
    """UI/검증용: Agent Job으로 매핑되는 operation_type 문자열 목록."""
    pool = set(ACCOUNT_JOB_VALID_ACTIONS)
    pool.update({
        'ACCOUNT_CREATE',
        'ACCOUNT_DELETE',
        'ACCOUNT_LOCK',
        'ACCOUNT_UNLOCK',
        'PASSWORD_CHANGE',
        'PASSWORD_RESET',
        'ROLE_ADD',
        'ROLE_REMOVE',
    })
    return sorted({str(x).upper() for x in pool if _op_to_account_job_action(_text(x, 80))})


def apply_account_job_result(
    *,
    agent_job_request_id: str,
    ok: bool,
    error_code: str = '',
    exit_code: Any = None,
    actor: str = 'agent',
    app=None,
) -> bool:
    """Agent job 결과를 통합 신청 workflow_status에 반영."""
    rid = _text(agent_job_request_id, 80)
    if not rid:
        return False
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {REQUEST_TABLE} WHERE agent_job_request_id = ? ORDER BY id DESC LIMIT 1",
            (rid,),
        ).fetchone()
        if not row:
            return False
        now = _now()
        if ok:
            conn.execute(
                f"""UPDATE {REQUEST_TABLE}
                       SET status = ?, workflow_status = ?, failure_reason = NULL, updated_at = ?
                     WHERE id = ?""",
                (REQUEST_STATUS_APPROVED, WORKFLOW_COMPLETED, now, int(row['id'])),
            )
            _append_workflow_event(conn, int(row['id']), 'AGENT_JOB_SUCCEEDED', actor, {'job_request_id': rid})
        else:
            reason = _text(error_code or 'job_failed', 1000)
            conn.execute(
                f"""UPDATE {REQUEST_TABLE}
                       SET workflow_status = ?, failure_reason = ?, updated_at = ?
                     WHERE id = ?""",
                (WORKFLOW_FAILED, reason, now, int(row['id'])),
            )
            _append_workflow_event(conn, int(row['id']), 'AGENT_JOB_FAILED', actor, {'job_request_id': rid, 'errorCode': reason, 'exitCode': exit_code})
        conn.commit()
        return True

def _row_integration_type(row: sqlite3.Row) -> str:
    try:
        v = row['integration_type']
    except (KeyError, IndexError):
        v = None
    r = _text(v or INTEGRATION_INTEGRATED, 32).upper()
    return r if r else INTEGRATION_INTEGRATED


def _workflow_label(workflow_status: str) -> str:
    ws = _text(workflow_status, 48).upper()
    return WORKFLOW_LABEL_KO.get(ws, workflow_status or '-')


def _system_type_from_asset(asset_category: str, asset_scope: str, asset_type: str) -> str:
    hay = f'{asset_category} {asset_scope} {asset_type}'.lower()
    if 'san' in hay:
        return 'SAN'
    if 'storage' in hay or '스토리지' in hay:
        return 'STORAGE'
    if 'network' in hay or '네트워크' in hay:
        return 'NETWORK'
    if 'security' in hay or '보안' in hay:
        return 'SECURITY'
    return 'SERVER'


def _collection_status_from_source(value: Any) -> str:
    raw = _text(value, 30).upper()
    if raw in ('INACTIVE', 'DISABLED', 'LOCKED', '퇴직', '비활성'):
        return 'INACTIVE'
    return 'ACTIVE'


def init_identity_governance_tables(app=None) -> None:
    with _get_connection(app) as conn:
        conn.executescript(
            f'''
            CREATE TABLE IF NOT EXISTS {USER_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_user_id INTEGER UNIQUE,
                name TEXT NOT NULL,
                email TEXT,
                department TEXT,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS {ADMIN_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_user_id INTEGER UNIQUE,
                name TEXT NOT NULL,
                email TEXT,
                department TEXT,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS {ADMIN_USER_TABLE} (
                admin_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                PRIMARY KEY (admin_id, user_id),
                FOREIGN KEY (admin_id) REFERENCES {ADMIN_TABLE}(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES {USER_TABLE}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS {INTEGRATED_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_name TEXT NOT NULL,
                account_type TEXT NOT NULL,
                owner_type TEXT NOT NULL,
                owner_id INTEGER NOT NULL,
                department TEXT,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_deleted INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS {SOURCE_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                system_type TEXT NOT NULL,
                system_name TEXT NOT NULL,
                account_id TEXT NOT NULL,
                access_info TEXT,
                privilege TEXT,
                collection_type TEXT NOT NULL DEFAULT 'MANUAL',
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                source_ref TEXT,
                source_ref_id INTEGER,
                ad_sync_state TEXT,
                last_synced_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                UNIQUE (source_ref, source_ref_id)
            );

            CREATE TABLE IF NOT EXISTS {ACCOUNT_MAPPING_TABLE} (
                integrated_account_id INTEGER NOT NULL,
                source_account_id INTEGER NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                PRIMARY KEY (integrated_account_id, source_account_id),
                FOREIGN KEY (integrated_account_id) REFERENCES {INTEGRATED_TABLE}(id) ON DELETE CASCADE,
                FOREIGN KEY (source_account_id) REFERENCES {SOURCE_TABLE}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS {REQUEST_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_name TEXT NOT NULL,
                account_type TEXT NOT NULL,
                target_owner_type TEXT NOT NULL,
                target_owner_id INTEGER NOT NULL,
                system_type TEXT NOT NULL,
                account_id TEXT NOT NULL,
                privilege TEXT,
                request_reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT '승인대기',
                requester TEXT,
                admin_approved_at TEXT,
                ops_approved_at TEXT,
                rejected_reason TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS {AUDIT_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_type TEXT NOT NULL,
                target_account TEXT,
                actor TEXT,
                change_summary TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS {AD_GROUP_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_name TEXT NOT NULL,
                domain_name TEXT,
                group_dn TEXT,
                manager_admin_id INTEGER,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                sync_state TEXT NOT NULL DEFAULT 'MANUAL',
                last_synced_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (domain_name, group_name)
            );

            CREATE TABLE IF NOT EXISTS {AD_GROUP_MAPPING_TABLE} (
                group_id INTEGER NOT NULL,
                integrated_account_id INTEGER NOT NULL,
                permission_level TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                PRIMARY KEY (group_id, integrated_account_id),
                FOREIGN KEY (group_id) REFERENCES {AD_GROUP_TABLE}(id) ON DELETE CASCADE,
                FOREIGN KEY (integrated_account_id) REFERENCES {INTEGRATED_TABLE}(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS {ACCESS_REVIEW_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                review_name TEXT NOT NULL,
                admin_id INTEGER,
                status TEXT NOT NULL DEFAULT '대기',
                due_date TEXT,
                result TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES {ADMIN_TABLE}(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS {ACCESS_REVIEW_ITEM_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                review_id INTEGER NOT NULL,
                integrated_account_id INTEGER,
                source_account_id INTEGER,
                result TEXT NOT NULL DEFAULT '유지',
                note TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (review_id) REFERENCES {ACCESS_REVIEW_TABLE}(id) ON DELETE CASCADE,
                FOREIGN KEY (integrated_account_id) REFERENCES {INTEGRATED_TABLE}(id) ON DELETE SET NULL,
                FOREIGN KEY (source_account_id) REFERENCES {SOURCE_TABLE}(id) ON DELETE SET NULL
            );
            '''
        )
        conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{SOURCE_TABLE}_system_type ON {SOURCE_TABLE}(system_type)')
        conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{SOURCE_TABLE}_account_id ON {SOURCE_TABLE}(account_id)')
        conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{INTEGRATED_TABLE}_account_type ON {INTEGRATED_TABLE}(account_type)')
        conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{AUDIT_TABLE}_created_at ON {AUDIT_TABLE}(created_at)')
        _migrate_identity_request_extensions(conn)
        _sync_principals_from_org_users(conn)
        conn.commit()


def _record_audit(conn: sqlite3.Connection, action_type: str, target_account: str, actor: str, summary: str) -> None:
    conn.execute(
        f'''INSERT INTO {AUDIT_TABLE} (action_type, target_account, actor, change_summary, created_at)
            VALUES (?, ?, ?, ?, ?)''',
        (_text(action_type, 40), _text(target_account, 255), _text(actor, 120), _text(summary, 2000), _now()),
    )


def _upsert_principal(conn: sqlite3.Connection, org_id: int, name: str, email: str, department: str, status: str, is_admin: bool) -> None:
    now = _now()
    conn.execute(
        f'''INSERT INTO {USER_TABLE} (org_user_id, name, email, department, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(org_user_id) DO UPDATE SET
                name = excluded.name,
                email = excluded.email,
                department = excluded.department,
                status = excluded.status,
                updated_at = excluded.updated_at''',
        (org_id, name, email, department, status, now, now),
    )
    if is_admin:
        conn.execute(
            f'''INSERT INTO {ADMIN_TABLE} (org_user_id, name, email, department, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(org_user_id) DO UPDATE SET
                    name = excluded.name,
                    email = excluded.email,
                    department = excluded.department,
                    status = excluded.status,
                    updated_at = excluded.updated_at''',
            (org_id, name, email, department, status, now, now),
        )


def _sync_principals_from_user_profiles(conn: sqlite3.Connection) -> None:
    try:
        from app.models import UserProfile

        profiles = UserProfile.query.order_by(UserProfile.id.asc()).limit(1000).all()
    except Exception:
        return
    for profile in profiles:
        org_id = _as_int(getattr(profile, 'id', None))
        if not org_id:
            continue
        name = _text(getattr(profile, 'name', '') or getattr(profile, 'nickname', '') or getattr(profile, 'emp_no', '') or f'USER-{org_id}', 128)
        email = _text(getattr(profile, 'email', ''), 255)
        department = _text(getattr(profile, 'department', ''), 128)
        employment = _text(getattr(profile, 'employment_status', '') or '재직', 20)
        status = 'INACTIVE' if employment in ('퇴직', '휴직') else 'ACTIVE'
        role = _text(getattr(profile, 'role', ''), 50).upper()
        emp_no = _text(getattr(profile, 'emp_no', ''), 50).upper()
        _upsert_principal(conn, org_id, name, email, department, status, role in ('ADMIN', '관리자') or emp_no == 'ADMIN')


def _sync_principals_from_org_users(conn: sqlite3.Connection) -> None:
    synced_from_org = False
    if _table_exists(conn, 'org_user'):
        cols = _columns(conn, 'org_user')
        wanted = [c for c in ('id', 'name', 'nickname', 'email', 'department', 'role', 'employment_status', 'emp_no') if c in cols]
        if 'id' in wanted:
            rows = conn.execute(f"SELECT {', '.join(wanted)} FROM org_user ORDER BY id ASC LIMIT 1000").fetchall()
            synced_from_org = bool(rows)
            for row in rows:
                org_id = int(row['id'])
                name = _text(row['name'] if 'name' in row.keys() else '', 128)
                if not name:
                    name = _text(row['nickname'] if 'nickname' in row.keys() else '', 128)
                if not name:
                    name = _text(row['emp_no'] if 'emp_no' in row.keys() else f'USER-{org_id}', 128)
                email = _text(row['email'] if 'email' in row.keys() else '', 255)
                department = _text(row['department'] if 'department' in row.keys() else '', 128)
                employment = _text(row['employment_status'] if 'employment_status' in row.keys() else '재직', 20)
                status = 'INACTIVE' if employment in ('퇴직', '휴직') else 'ACTIVE'
                role = _text(row['role'] if 'role' in row.keys() else '', 50).upper()
                emp_no = _text(row['emp_no'] if 'emp_no' in row.keys() else '', 50).upper()
                _upsert_principal(conn, org_id, name, email, department, status, role in ('ADMIN', '관리자') or emp_no == 'ADMIN')

    if not synced_from_org:
        _sync_principals_from_user_profiles(conn)

    admin_count = conn.execute(f'SELECT COUNT(1) FROM {ADMIN_TABLE} WHERE status = ?', ('ACTIVE',)).fetchone()[0]
    if int(admin_count or 0) <= 0:
        first_user = conn.execute(f'SELECT * FROM {USER_TABLE} WHERE status = ? ORDER BY id ASC LIMIT 1', ('ACTIVE',)).fetchone()
        if first_user:
            now = _now()
            conn.execute(
                f'''INSERT OR IGNORE INTO {ADMIN_TABLE} (org_user_id, name, email, department, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (first_user['org_user_id'], first_user['name'], first_user['email'], first_user['department'], first_user['status'], now, now),
            )

    first_admin = conn.execute(f'SELECT id FROM {ADMIN_TABLE} WHERE status = ? ORDER BY id ASC LIMIT 1', ('ACTIVE',)).fetchone()
    if first_admin:
        now = _now()
        users = conn.execute(f'SELECT id FROM {USER_TABLE} WHERE status = ? ORDER BY id ASC', ('ACTIVE',)).fetchall()
        for user in users:
            has_admin = conn.execute(
                f'SELECT 1 FROM {ADMIN_USER_TABLE} WHERE user_id = ? LIMIT 1',
                (user['id'],),
            ).fetchone()
            if not has_admin:
                conn.execute(
                    f'''INSERT OR IGNORE INTO {ADMIN_USER_TABLE} (admin_id, user_id, created_at, created_by)
                        VALUES (?, ?, ?, ?)''',
                    (first_admin['id'], user['id'], now, 'system'),
                )


def _principal(conn: sqlite3.Connection, owner_type: str, owner_id: int) -> Optional[Dict[str, Any]]:
    table = USER_TABLE if owner_type == 'USER' else ADMIN_TABLE
    row = conn.execute(f'SELECT * FROM {table} WHERE id = ?', (int(owner_id),)).fetchone()
    if not row:
        return None
    return {
        'id': int(row['id']),
        'owner_type': owner_type,
        'name': row['name'] or '',
        'email': row['email'] or '',
        'department': row['department'] or '',
        'status': row['status'] or 'ACTIVE',
    }


def _ensure_owner_policy(conn: sqlite3.Connection, account_type: str, owner_type: str, owner_id: int) -> Dict[str, Any]:
    if account_type == 'PERSONAL' and owner_type != 'USER':
        raise ValueError('PERSONAL 계정은 USER에만 매핑할 수 있습니다.')
    if account_type == 'SERVICE' and owner_type != 'ADMIN':
        raise ValueError('SERVICE 계정은 ADMIN에만 매핑할 수 있습니다.')
    owner = _principal(conn, owner_type, int(owner_id))
    if not owner:
        raise ValueError('소유자 정보를 찾을 수 없습니다.')
    if owner_type == 'USER':
        exists = conn.execute(
            f'SELECT 1 FROM {ADMIN_USER_TABLE} WHERE user_id = ? LIMIT 1',
            (int(owner_id),),
        ).fetchone()
        if not exists:
            raise ValueError('USER는 ADMIN 매핑이 필요합니다.')
    return owner


def list_users(app=None) -> List[Dict[str, Any]]:
    with _get_connection(app) as conn:
        _sync_principals_from_org_users(conn)
        conn.commit()
        rows = conn.execute(f'SELECT * FROM {USER_TABLE} ORDER BY department, name, id').fetchall()
        return [dict(row) for row in rows]


def list_admins(app=None) -> List[Dict[str, Any]]:
    with _get_connection(app) as conn:
        _sync_principals_from_org_users(conn)
        conn.commit()
        rows = conn.execute(f'SELECT * FROM {ADMIN_TABLE} ORDER BY department, name, id').fetchall()
        items = []
        for row in rows:
            item = dict(row)
            count = conn.execute(f'SELECT COUNT(1) FROM {ADMIN_USER_TABLE} WHERE admin_id = ?', (row['id'],)).fetchone()[0]
            item['user_count'] = int(count or 0)
            items.append(item)
        return items


def _fetch_source_accounts(conn: sqlite3.Connection, only_unmapped: bool = False) -> List[Dict[str, Any]]:
    where = 's.is_deleted = 0'
    if only_unmapped:
        where += f' AND m.source_account_id IS NULL'
    rows = conn.execute(
        f'''
        SELECT s.*, m.integrated_account_id, ia.account_name AS integrated_account_name
          FROM {SOURCE_TABLE} s
          LEFT JOIN {ACCOUNT_MAPPING_TABLE} m ON m.source_account_id = s.id
          LEFT JOIN {INTEGRATED_TABLE} ia ON ia.id = m.integrated_account_id AND ia.is_deleted = 0
         WHERE {where}
         ORDER BY s.system_type, s.system_name, s.account_id, s.id
        '''
    ).fetchall()
    return [dict(row) for row in rows]


def _fetch_integrated_accounts(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    rows = conn.execute(
        f'''SELECT * FROM {INTEGRATED_TABLE} WHERE is_deleted = 0 ORDER BY account_name COLLATE NOCASE ASC, id ASC'''
    ).fetchall()
    items: List[Dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        owner = _principal(conn, item['owner_type'], int(item['owner_id'])) or {}
        item['owner'] = owner
        item['owner_name'] = owner.get('name', '')
        item['owner_email'] = owner.get('email', '')
        item['department'] = item.get('department') or owner.get('department', '')
        sources = conn.execute(
            f'''
            SELECT s.*
              FROM {ACCOUNT_MAPPING_TABLE} m
              JOIN {SOURCE_TABLE} s ON s.id = m.source_account_id AND s.is_deleted = 0
             WHERE m.integrated_account_id = ?
             ORDER BY s.system_type, s.system_name, s.account_id
            ''',
            (item['id'],),
        ).fetchall()
        src_items = [dict(source) for source in sources]
        item['source_accounts'] = src_items
        item['source_count'] = len(src_items)
        item['system_types'] = sorted({source.get('system_type') or '' for source in src_items if source.get('system_type')})
        item['privileges'] = sorted({source.get('privilege') or '' for source in src_items if source.get('privilege')})
        item['privilege_summary'] = ', '.join(item['privileges'][:4]) if item['privileges'] else '-'
        if len(item['privileges']) > 4:
            item['privilege_summary'] += f' 외 {len(item["privileges"]) - 4}'
        item['ad_sync_state'] = 'SYNCED' if any((source.get('system_type') == 'AD' and source.get('ad_sync_state')) for source in src_items) else ''
        items.append(item)
    return items


def list_integrated_accounts(filters: Optional[Dict[str, Any]] = None, app=None) -> Dict[str, Any]:
    sync_source_accounts(actor='system', app=app)
    filters = filters or {}
    keyword = _text(filters.get('keyword'), 100).lower()
    account_type = _text(filters.get('account_type'), 20).upper()
    system_type = _normalize_system_type(filters.get('system_type')) if filters.get('system_type') else ''
    status = _normalize_status(filters.get('status'), '') if filters.get('status') else ''

    with _get_connection(app) as conn:
        rows = _fetch_integrated_accounts(conn)
    result = []
    for row in rows:
        if account_type and row.get('account_type') != account_type:
            continue
        if status and row.get('status') != status:
            continue
        if system_type and system_type not in row.get('system_types', []):
            continue
        if keyword:
            hay = [row.get('account_name'), row.get('owner_name'), row.get('owner_email'), row.get('department')]
            for source in row.get('source_accounts') or []:
                hay.extend([source.get('system_name'), source.get('account_id'), source.get('access_info'), source.get('privilege')])
            if keyword not in ' '.join([str(v or '').lower() for v in hay]):
                continue
        result.append(row)
    return {'rows': result, 'total': len(result)}


def get_integrated_account(account_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        rows = [row for row in _fetch_integrated_accounts(conn) if int(row['id']) == int(account_id)]
        return rows[0] if rows else None


def create_integrated_account(payload: Dict[str, Any], actor: str = 'system', app=None) -> Dict[str, Any]:
    account_name = _text(payload.get('account_name') or payload.get('name'), 255)
    if not account_name:
        raise ValueError('계정명을 입력하세요.')
    account_type = _normalize_account_type(payload.get('account_type'))
    owner_type = _normalize_owner_type(payload.get('owner_type') or ('USER' if account_type == 'PERSONAL' else 'ADMIN'))
    owner_id = _as_int(payload.get('owner_id'))
    if not owner_id:
        raise ValueError('소유자를 선택하세요.')
    status = _normalize_status(payload.get('status'))
    source_ids = payload.get('source_account_ids') or payload.get('source_ids') or []
    if isinstance(source_ids, (str, int)):
        source_ids = [source_ids]
    with _get_connection(app) as conn:
        owner = _ensure_owner_policy(conn, account_type, owner_type, owner_id)
        existing = conn.execute(
            f'SELECT id FROM {INTEGRATED_TABLE} WHERE is_deleted = 0 AND lower(account_name) = lower(?) LIMIT 1',
            (account_name,),
        ).fetchone()
        if existing:
            raise ValueError('이미 등록된 통합계정명입니다.')
        now = _now()
        cur = conn.execute(
            f'''
            INSERT INTO {INTEGRATED_TABLE}
                (account_name, account_type, owner_type, owner_id, department, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (account_name, account_type, owner_type, owner_id, _text(payload.get('department') or owner.get('department'), 128), status, now, now),
        )
        new_id = int(cur.lastrowid)
        for source_id in source_ids:
            source_id_int = _as_int(source_id)
            if source_id_int:
                _map_source_account(conn, new_id, source_id_int, actor)
        _record_audit(conn, '생성', account_name, actor, f'{account_type} 통합계정 생성')
        conn.commit()
    item = get_integrated_account(new_id, app=app)
    if not item:
        raise RuntimeError('통합계정 생성 후 조회에 실패했습니다.')
    return item


def update_integrated_account(account_id: int, payload: Dict[str, Any], actor: str = 'system', app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {INTEGRATED_TABLE} WHERE id = ? AND is_deleted = 0', (int(account_id),)).fetchone()
        if not row:
            return None
        account_type = _normalize_account_type(payload.get('account_type') or row['account_type'])
        owner_type = _normalize_owner_type(payload.get('owner_type') or row['owner_type'])
        owner_id = _as_int(payload.get('owner_id')) or int(row['owner_id'])
        owner = _ensure_owner_policy(conn, account_type, owner_type, owner_id)
        account_name = _text(payload.get('account_name') or row['account_name'], 255)
        status = _normalize_status(payload.get('status') or row['status'])
        department = _text(payload.get('department') or owner.get('department') or row['department'], 128)
        conn.execute(
            f'''UPDATE {INTEGRATED_TABLE}
                   SET account_name = ?, account_type = ?, owner_type = ?, owner_id = ?, department = ?, status = ?, updated_at = ?
                 WHERE id = ?''',
            (account_name, account_type, owner_type, owner_id, department, status, _now(), int(account_id)),
        )
        _record_audit(conn, '변경', account_name, actor, '통합계정 기본 정보 변경')
        conn.commit()
    return get_integrated_account(account_id, app=app)


def create_source_account(payload: Dict[str, Any], actor: str = 'system', app=None) -> Dict[str, Any]:
    system_type = _normalize_system_type(payload.get('system_type'))
    system_name = _text(payload.get('system_name'), 255)
    account_id = _text(payload.get('account_id'), 255)
    if not system_name or not account_id:
        raise ValueError('시스템명과 계정ID를 입력하세요.')
    collection_type = _normalize_collection_type(payload.get('collection_type'))
    status = _normalize_status(payload.get('status'))
    with _get_connection(app) as conn:
        now = _now()
        cur = conn.execute(
            f'''
            INSERT INTO {SOURCE_TABLE}
                (system_type, system_name, account_id, access_info, privilege, collection_type, status,
                 source_ref, source_ref_id, ad_sync_state, last_synced_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                system_type,
                system_name,
                account_id,
                _text(payload.get('access_info'), 500),
                _text(payload.get('privilege'), 255),
                collection_type,
                status,
                _text(payload.get('source_ref') or 'manual', 80),
                _as_int(payload.get('source_ref_id')),
                _text(payload.get('ad_sync_state'), 40),
                now if collection_type == 'AUTO' else None,
                now,
                now,
            ),
        )
        new_id = int(cur.lastrowid)
        _record_audit(conn, '생성', account_id, actor, f'{system_type} SourceAccount 등록')
        conn.commit()
        row = conn.execute(f'SELECT * FROM {SOURCE_TABLE} WHERE id = ?', (new_id,)).fetchone()
        return dict(row)


def list_source_accounts(filters: Optional[Dict[str, Any]] = None, app=None) -> Dict[str, Any]:
    sync_source_accounts(actor='system', app=app)
    filters = filters or {}
    only_unmapped = str(filters.get('unmapped') or '').lower() in ('1', 'true', 'y', 'yes')
    keyword = _text(filters.get('keyword'), 100).lower()
    system_type = _normalize_system_type(filters.get('system_type')) if filters.get('system_type') else ''
    with _get_connection(app) as conn:
        rows = _fetch_source_accounts(conn, only_unmapped=only_unmapped)
    result = []
    for row in rows:
        if system_type and row.get('system_type') != system_type:
            continue
        if keyword:
            hay = [row.get('system_type'), row.get('system_name'), row.get('account_id'), row.get('access_info'), row.get('privilege')]
            if keyword not in ' '.join([str(v or '').lower() for v in hay]):
                continue
        result.append(row)
    return {'rows': result, 'total': len(result)}


def _map_source_account(conn: sqlite3.Connection, integrated_account_id: int, source_account_id: int, actor: str) -> None:
    ia = conn.execute(
        f'SELECT * FROM {INTEGRATED_TABLE} WHERE id = ? AND is_deleted = 0',
        (int(integrated_account_id),),
    ).fetchone()
    src = conn.execute(
        f'SELECT * FROM {SOURCE_TABLE} WHERE id = ? AND is_deleted = 0',
        (int(source_account_id),),
    ).fetchone()
    if not ia or not src:
        raise ValueError('매핑 대상을 찾을 수 없습니다.')
    try:
        conn.execute(
            f'''INSERT INTO {ACCOUNT_MAPPING_TABLE} (integrated_account_id, source_account_id, created_at, created_by)
                VALUES (?, ?, ?, ?)''',
            (int(integrated_account_id), int(source_account_id), _now(), actor),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError('이미 다른 통합계정에 연결된 SourceAccount입니다.') from exc
    _record_audit(conn, '매핑', ia['account_name'], actor, f"SourceAccount 연결: {src['system_type']} / {src['account_id']}")


def map_source_account(integrated_account_id: int, source_account_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        _map_source_account(conn, int(integrated_account_id), int(source_account_id), actor)
        conn.commit()
    item = get_integrated_account(integrated_account_id, app=app)
    return item or {}


def unmap_source_account(source_account_id: int, actor: str = 'system', app=None) -> bool:
    with _get_connection(app) as conn:
        row = conn.execute(
            f'''
            SELECT ia.account_name, s.account_id, s.system_type
              FROM {ACCOUNT_MAPPING_TABLE} m
              JOIN {INTEGRATED_TABLE} ia ON ia.id = m.integrated_account_id
              JOIN {SOURCE_TABLE} s ON s.id = m.source_account_id
             WHERE m.source_account_id = ?
            ''',
            (int(source_account_id),),
        ).fetchone()
        cur = conn.execute(f'DELETE FROM {ACCOUNT_MAPPING_TABLE} WHERE source_account_id = ?', (int(source_account_id),))
        if row and cur.rowcount:
            _record_audit(conn, '매핑', row['account_name'], actor, f"SourceAccount 연결 해제: {row['system_type']} / {row['account_id']}")
        conn.commit()
        return cur.rowcount > 0


def sync_source_accounts(actor: str = 'system', app=None) -> Dict[str, int]:
    stats = {'server_inserted': 0, 'server_updated': 0, 'ad_inserted': 0, 'ad_updated': 0}
    with _get_connection(app) as conn:
        now = _now()
        if _table_exists(conn, 'asset_account'):
            cols = _columns(conn, 'asset_account')
            select_cols = [
                'aa.id', 'aa.asset_scope', 'aa.asset_id', 'aa.system_key', 'aa.status', 'aa.account_type',
                'aa.account_name', 'aa.group_name', 'aa.role', 'aa.privilege_level', 'aa.admin_allowed', 'aa.su_allowed',
            ]
            if 'is_deleted' in cols:
                where = 'COALESCE(aa.is_deleted, 0) = 0'
            else:
                where = '1 = 1'
            hardware_join = ''
            hardware_cols = "'' AS asset_category, '' AS asset_type, '' AS system_name, '' AS asset_name, '' AS system_ip, '' AS mgmt_ip"
            if _table_exists(conn, 'hardware'):
                hardware_join = 'LEFT JOIN hardware h ON h.id = aa.asset_id'
                hardware_cols = 'h.asset_category, h.asset_type, h.system_name, h.asset_name, h.system_ip, h.mgmt_ip'
            rows = conn.execute(
                f'''SELECT {', '.join(select_cols)}, {hardware_cols}
                      FROM asset_account aa
                      {hardware_join}
                     WHERE {where}
                     ORDER BY aa.id ASC'''
            ).fetchall()
            for row in rows:
                system_type = _system_type_from_asset(row['asset_category'] or '', row['asset_scope'] or '', row['asset_type'] or '')
                system_name = _text(row['system_name'] or row['asset_name'] or f"{row['asset_scope']}#{row['asset_id']}", 255)
                account_id = _text(row['account_name'], 255)
                if not account_id:
                    continue
                privilege = _text(row['privilege_level'] or row['role'] or row['account_type'] or row['group_name'], 255)
                if not privilege and (row['admin_allowed'] or row['su_allowed']):
                    privilege = 'admin'
                existing = conn.execute(
                    f'SELECT * FROM {SOURCE_TABLE} WHERE source_ref = ? AND source_ref_id = ?',
                    ('asset_account', int(row['id'])),
                ).fetchone()
                params = (
                    system_type,
                    system_name,
                    account_id,
                    _text(row['system_ip'] or row['mgmt_ip'], 500),
                    privilege,
                    'AUTO',
                    _collection_status_from_source(row['status']),
                    'asset_account',
                    int(row['id']),
                    '',
                    now,
                    now,
                )
                if existing:
                    changed = any(str(existing[col] or '') != str(val or '') for col, val in zip(
                        ('system_type', 'system_name', 'account_id', 'access_info', 'privilege', 'collection_type', 'status', 'source_ref', 'source_ref_id', 'ad_sync_state'),
                        params[:10],
                    )) or int(existing['is_deleted'] or 0) != 0
                    if changed:
                        conn.execute(
                            f'''UPDATE {SOURCE_TABLE}
                                   SET system_type = ?, system_name = ?, account_id = ?, access_info = ?, privilege = ?,
                                       collection_type = ?, status = ?, source_ref = ?, source_ref_id = ?, ad_sync_state = ?,
                                       last_synced_at = ?, updated_at = ?, is_deleted = 0
                                 WHERE id = ?''',
                            params + (int(existing['id']),),
                        )
                        stats['server_updated'] += 1
                else:
                    conn.execute(
                        f'''INSERT INTO {SOURCE_TABLE}
                            (system_type, system_name, account_id, access_info, privilege, collection_type, status,
                             source_ref, source_ref_id, ad_sync_state, last_synced_at, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                        params[:11] + (now, now),
                    )
                    stats['server_inserted'] += 1

        if _table_exists(conn, 'network_ad_account'):
            ad_join = ''
            ad_cols = "'' AS domain_name, '' AS fqdn"
            if _table_exists(conn, 'network_ad_policy'):
                ad_join = 'LEFT JOIN network_ad_policy p ON p.ad_id = a.ad_id'
                ad_cols = 'p.domain_name, p.fqdn'
            rows = conn.execute(
                f'''SELECT a.account_id, a.ad_id, a.username, a.display_name, a.account_type, a.owner, a.privilege, a.status, {ad_cols}
                      FROM network_ad_account a
                      {ad_join}
                     ORDER BY a.account_id ASC'''
            ).fetchall()
            for row in rows:
                account_id = _text(row['username'], 255)
                if not account_id:
                    continue
                existing = conn.execute(
                    f'SELECT * FROM {SOURCE_TABLE} WHERE source_ref = ? AND source_ref_id = ?',
                    ('network_ad_account', int(row['account_id'])),
                ).fetchone()
                system_name = _text(row['domain_name'] or row['fqdn'] or f"AD#{row['ad_id']}", 255)
                params = (
                    'AD',
                    system_name,
                    account_id,
                    _text(row['fqdn'] or row['domain_name'], 500),
                    _text(row['privilege'] or row['account_type'], 255),
                    'AUTO',
                    _collection_status_from_source(row['status']),
                    'network_ad_account',
                    int(row['account_id']),
                    'SYNCED',
                    now,
                    now,
                )
                if existing:
                    changed = any(str(existing[col] or '') != str(val or '') for col, val in zip(
                        ('system_type', 'system_name', 'account_id', 'access_info', 'privilege', 'collection_type', 'status', 'source_ref', 'source_ref_id', 'ad_sync_state'),
                        params[:10],
                    )) or int(existing['is_deleted'] or 0) != 0
                    if changed:
                        conn.execute(
                            f'''UPDATE {SOURCE_TABLE}
                                   SET system_type = ?, system_name = ?, account_id = ?, access_info = ?, privilege = ?,
                                       collection_type = ?, status = ?, source_ref = ?, source_ref_id = ?, ad_sync_state = ?,
                                       last_synced_at = ?, updated_at = ?, is_deleted = 0
                                 WHERE id = ?''',
                            params + (int(existing['id']),),
                        )
                        stats['ad_updated'] += 1
                else:
                    conn.execute(
                        f'''INSERT INTO {SOURCE_TABLE}
                            (system_type, system_name, account_id, access_info, privilege, collection_type, status,
                             source_ref, source_ref_id, ad_sync_state, last_synced_at, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                        params[:11] + (now, now),
                    )
                    stats['ad_inserted'] += 1
        if any(stats.values()):
            _record_audit(conn, 'AD동기화', 'SourceAccount', actor, f"SourceAccount 동기화: {stats}")
        conn.commit()
    return stats


def match_source_account(source_account_id: int, app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        source = conn.execute(f'SELECT * FROM {SOURCE_TABLE} WHERE id = ? AND is_deleted = 0', (int(source_account_id),)).fetchone()
        if not source:
            raise ValueError('SourceAccount를 찾을 수 없습니다.')
        token = _text(source['account_id'], 255).lower()
        token = token.split('@')[0]
        token = token.replace('.', ' ').replace('_', ' ').replace('-', ' ')
        candidates = []
        for table, owner_type in ((USER_TABLE, 'USER'), (ADMIN_TABLE, 'ADMIN')):
            rows = conn.execute(f'SELECT * FROM {table} ORDER BY name ASC').fetchall()
            for row in rows:
                hay = ' '.join([str(row['name'] or ''), str(row['email'] or '')]).lower()
                score = 0
                if source['account_id'] and str(source['account_id']).lower() in hay:
                    score = 90
                elif token and token in hay:
                    score = 70
                elif token and any(part and part in hay for part in token.split()):
                    score = 45
                if score:
                    candidates.append({
                        'owner_type': owner_type,
                        'owner_id': int(row['id']),
                        'name': row['name'] or '',
                        'email': row['email'] or '',
                        'department': row['department'] or '',
                        'score': score,
                    })
        candidates.sort(key=lambda item: item['score'], reverse=True)
        return {'source': dict(source), 'suggestions': candidates[:10]}


def get_mapping_context(admin_id: Optional[int] = None, app=None) -> Dict[str, Any]:
    sync_source_accounts(actor='system', app=app)
    with _get_connection(app) as conn:
        _sync_principals_from_org_users(conn)
        conn.commit()
        admins = list_admins(app=app)
        if not admin_id and admins:
            admin_id = int(admins[0]['id'])
        admin_users: List[Dict[str, Any]] = []
        if admin_id:
            rows = conn.execute(
                f'''
                SELECT u.*
                  FROM {ADMIN_USER_TABLE} m
                  JOIN {USER_TABLE} u ON u.id = m.user_id
                 WHERE m.admin_id = ?
                 ORDER BY u.department, u.name, u.id
                ''',
                (int(admin_id),),
            ).fetchall()
            admin_users = [dict(row) for row in rows]
        service_accounts = []
        if admin_id:
            rows = conn.execute(
                f'''SELECT * FROM {INTEGRATED_TABLE}
                     WHERE is_deleted = 0 AND account_type = 'SERVICE' AND owner_type = 'ADMIN' AND owner_id = ?
                     ORDER BY account_name''',
                (int(admin_id),),
            ).fetchall()
            service_accounts = [get_integrated_account(int(row['id']), app=app) for row in rows]
            service_accounts = [row for row in service_accounts if row]
        return {
            'admins': admins,
            'users': list_users(app=app),
            'selected_admin_id': admin_id,
            'admin_users': admin_users,
            'service_accounts': service_accounts,
            'integrated_accounts': _fetch_integrated_accounts(conn),
            'unmapped_sources': _fetch_source_accounts(conn, only_unmapped=True),
        }


def add_user_to_admin(admin_id: int, user_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        admin = _principal(conn, 'ADMIN', int(admin_id))
        user = _principal(conn, 'USER', int(user_id))
        if not admin or not user:
            raise ValueError('관리자 또는 사용자 정보를 찾을 수 없습니다.')
        conn.execute(
            f'''INSERT OR IGNORE INTO {ADMIN_USER_TABLE} (admin_id, user_id, created_at, created_by)
                VALUES (?, ?, ?, ?)''',
            (int(admin_id), int(user_id), _now(), actor),
        )
        _record_audit(conn, '매핑', user['name'], actor, f"관리자 매핑: {admin['name']} -> {user['name']}")
        conn.commit()
    return get_mapping_context(admin_id=admin_id, app=app)


def remove_user_from_admin(admin_id: int, user_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        mapping_count = conn.execute(
            f'SELECT COUNT(1) FROM {ADMIN_USER_TABLE} WHERE user_id = ?',
            (int(user_id),),
        ).fetchone()[0]
        if int(mapping_count or 0) <= 1:
            raise ValueError('USER는 ADMIN 없이 존재할 수 없어 마지막 관리자 매핑은 제거할 수 없습니다.')
        conn.execute(
            f'DELETE FROM {ADMIN_USER_TABLE} WHERE admin_id = ? AND user_id = ?',
            (int(admin_id), int(user_id)),
        )
        _record_audit(conn, '매핑', f'USER#{user_id}', actor, f'관리자 사용자 매핑 제거: ADMIN#{admin_id}')
        conn.commit()
    return get_mapping_context(admin_id=admin_id, app=app)


def assign_service_account(admin_id: int, integrated_account_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        admin = _principal(conn, 'ADMIN', int(admin_id))
        row = conn.execute(
            f'SELECT * FROM {INTEGRATED_TABLE} WHERE id = ? AND is_deleted = 0',
            (int(integrated_account_id),),
        ).fetchone()
        if not admin or not row:
            raise ValueError('관리자 또는 서비스 계정을 찾을 수 없습니다.')
        if row['account_type'] != 'SERVICE':
            raise ValueError('SERVICE 계정만 ADMIN에게 할당할 수 있습니다.')
        conn.execute(
            f'''UPDATE {INTEGRATED_TABLE}
                   SET owner_type = 'ADMIN', owner_id = ?, department = ?, updated_at = ?
                 WHERE id = ?''',
            (int(admin_id), admin.get('department') or '', _now(), int(integrated_account_id)),
        )
        _record_audit(conn, '매핑', row['account_name'], actor, f"서비스 계정 관리자 할당: {admin['name']}")
        conn.commit()
    return get_mapping_context(admin_id=admin_id, app=app)


def create_request(payload: Dict[str, Any], actor: str = 'system', app=None) -> Dict[str, Any]:
    account_name = _text(payload.get('account_name'), 255)
    account_type = _normalize_account_type(payload.get('account_type'))
    owner_type = 'USER' if account_type == 'PERSONAL' else 'ADMIN'
    owner_id = _as_int(payload.get('target_owner_id') or payload.get('owner_id'))
    system_type = _normalize_system_type(payload.get('system_type'))
    account_id = _text(payload.get('account_id'), 255)
    reason = _text(payload.get('request_reason') or payload.get('reason'), 2000)
    integration_type = _normalize_integration_type(payload.get('integration_type'))
    operation_type = _normalize_operation_type(payload.get('operation_type'))
    if not account_name or not owner_id or not account_id or not reason:
        raise ValueError('계정명, 대상, 계정ID, 요청 사유는 필수입니다.')

    manual_system_name = _text(payload.get('manual_system_name'), 255)
    access_method = _text(payload.get('access_method'), 40).upper()
    location_detail = _text(payload.get('location_detail'), 2000)
    manual_guide = _text(payload.get('manual_guide'), 4000)
    operator_org_user_id = _as_int(payload.get('operator_org_user_id') or payload.get('assignee_org_user_id'))
    agent_pending_id = _as_int(payload.get('agent_pending_id') or payload.get('agent_id'))
    valid_from = _text(payload.get('valid_from') or payload.get('use_period_start'), 32)
    valid_until = _text(payload.get('valid_until') or payload.get('use_period_end'), 32)
    is_emergency = 1 if str(payload.get('is_emergency', '')).lower() in ('1', 'true', 'yes') else 0
    ext_raw = payload.get('extension') or payload.get('extension_json') or {}
    if isinstance(ext_raw, str):
        try:
            ext_obj = json.loads(ext_raw or '{}')
        except json.JSONDecodeError:
            raise ValueError('extension_json 형식이 올바르지 않습니다.') from None
    else:
        ext_obj = ext_raw if isinstance(ext_raw, dict) else {}
    extension_json = json.dumps(ext_obj, ensure_ascii=False)

    if integration_type == INTEGRATION_NON_INTEGRATED:
        am = access_method if access_method in ('CLI', 'WEB', 'GUI', 'OTHER') else ''
        if not manual_system_name or not location_detail or not manual_guide or am not in ('CLI', 'WEB', 'GUI', 'OTHER'):
            raise ValueError('미연동 신청에서는 시스템명·접속 방식(CLI/WEB/GUI/OTHER)·위치 상세·작업 요청 상세가 필수입니다.')
        access_method = am

    mapped_action = _op_to_account_job_action(operation_type)
    if integration_type == INTEGRATION_INTEGRATED and mapped_action:
        if not agent_pending_id:
            raise ValueError('연동 자동(Account Job) 처리가 필요한 작업에는 연동 에이전트(agent_pending_id)를 선택해야 합니다.')

    app = app or current_app
    with _get_connection(app) as conn:
        _ensure_owner_policy(conn, account_type, owner_type, owner_id)
        status = REQUEST_STATUS_PENDING
        wf = WORKFLOW_REQUESTED
        now = _now()
        public_id = str(uuid.uuid4())
        privilege = _text(payload.get('privilege'), 255)
        cur = conn.execute(
            f'''
            INSERT INTO {REQUEST_TABLE}
                (account_name, account_type, target_owner_type, target_owner_id, system_type, account_id,
                 privilege, request_reason, status, requester, created_at, updated_at,
                 public_id, integration_type, operation_type, workflow_status, agent_pending_id, agent_job_request_id,
                 manual_system_name, access_method, location_detail, manual_guide,
                 operator_org_user_id, valid_from, valid_until, is_emergency, extension_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                account_name, account_type, owner_type, int(owner_id), system_type, account_id,
                privilege, reason, status, actor, now, now,
                public_id, integration_type, operation_type, wf, agent_pending_id, None,
                manual_system_name, access_method or None, location_detail or None,
                manual_guide or None,
                operator_org_user_id, valid_from or None, valid_until or None, is_emergency, extension_json,
            ),
        )
        rid = int(cur.lastrowid)
        _record_audit(conn, '생성', account_name, actor, f'{account_type} 통합 신청 [{integration_type}]')
        _append_workflow_event(conn, rid, 'CREATED', actor, {'integration_type': integration_type, 'operation_type': operation_type})
        conn.commit()
        return get_request(rid, app=app) or {}


def _row_to_request(conn: sqlite3.Connection, row: sqlite3.Row) -> Dict[str, Any]:
    item = dict(row)
    owner = _principal(conn, item['target_owner_type'], int(item['target_owner_id'])) or {}
    item['target_owner'] = owner
    item['target_owner_name'] = owner.get('name', '')
    ws = item.get('workflow_status') or _workflow_from_legacy_status(item.get('status') or '')
    item['workflow_status'] = ws
    item['workflow_label_ko'] = _workflow_label(ws)
    return item


def _attach_lumina_account_jobs(rows: List[Dict[str, Any]], app=None) -> None:
    """agent_job_request_id가 있으면 lumina_account_jobs 요약을 lumina_account_job 키로 붙인다."""
    from app.services.account_job_service import get_account_jobs_snapshot_by_request_ids

    want: List[str] = []
    for row in rows or []:
        jid = row.get('agent_job_request_id')
        if jid:
            s = str(jid).strip()
            if s:
                want.append(s)
    if not want:
        for row in rows or []:
            row['lumina_account_job'] = None
        return
    snap = get_account_jobs_snapshot_by_request_ids(want, app=app)
    for row in rows or []:
        jid = row.get('agent_job_request_id')
        if not jid:
            row['lumina_account_job'] = None
            continue
        key = str(jid).strip()
        row['lumina_account_job'] = snap.get(key) if key else None


def get_request(request_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {REQUEST_TABLE} WHERE id = ?', (int(request_id),)).fetchone()
        if not row:
            return None
        item = _row_to_request(conn, row)
    _attach_lumina_account_jobs([item], app=app)
    return item


def list_requests(filters: Optional[Dict[str, Any]] = None, app=None) -> Dict[str, Any]:
    filters = filters or {}
    status = _text(filters.get('status'), 40)
    workflow_status = _text(filters.get('workflow_status'), 48).upper()
    keyword = _text(filters.get('keyword'), 100).lower()
    with _get_connection(app) as conn:
        sql = f'SELECT * FROM {REQUEST_TABLE}'
        clauses: List[str] = []
        params: List[Any] = []
        if status:
            clauses.append('status = ?')
            params.append(status)
        if workflow_status:
            clauses.append('workflow_status = ?')
            params.append(workflow_status)
        if clauses:
            sql += ' WHERE ' + ' AND '.join(clauses)
        sql += ' ORDER BY id DESC'
        rows = [_row_to_request(conn, row) for row in conn.execute(sql, params).fetchall()]
    if keyword:
        rows = [
            row for row in rows
            if keyword in ' '.join([
                str(row.get(k) or '').lower()
                for k in (
                    'account_name',
                    'account_id',
                    'system_type',
                    'target_owner_name',
                    'request_reason',
                    'integration_type',
                    'manual_system_name',
                    'workflow_label_ko',
                    'public_id',
                )
            ])
        ]
    _attach_lumina_account_jobs(rows, app=app)
    return {'rows': rows, 'total': len(rows)}


def list_request_events(request_id: int, app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        rows = conn.execute(
            f'SELECT * FROM {WORKFLOW_EVENT_TABLE} WHERE request_id = ? ORDER BY id ASC',
            (int(request_id),),
        ).fetchall()
        items = []
        for row in rows:
            d = dict(row)
            try:
                d['payload'] = json.loads(d.get('payload_json') or '{}')
            except json.JSONDecodeError:
                d['payload'] = {}
            d.pop('payload_json', None)
            items.append(d)
        return {'rows': items, 'total': len(items)}


def list_request_manual_tasks(request_id: int, app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        rows = conn.execute(
            f'SELECT * FROM {TASK_TABLE} WHERE request_id = ? ORDER BY id ASC',
            (int(request_id),),
        ).fetchall()
        return {'rows': [dict(row) for row in rows], 'total': len(rows)}


def _evidence_attachment_count(conn: sqlite3.Connection, request_id: int) -> int:
    n = conn.execute(
        f"""
        SELECT COUNT(1) FROM {ATTACHMENT_TABLE}
         WHERE request_id = ?
           AND (kind LIKE 'EVIDENCE%' OR kind IN ('SCREENSHOT_BEFORE', 'SCREENSHOT_AFTER', 'LOG'))
        """,
        (int(request_id),),
    ).fetchone()[0]
    return int(n or 0)


def assign_request_manual_task(request_id: int, assignee_org_user_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    oid = _as_int(assignee_org_user_id)
    if not oid:
        raise ValueError('담당자(org_user id)가 필요합니다.')
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {REQUEST_TABLE} WHERE id = ?', (int(request_id),)).fetchone()
        if not row:
            raise ValueError('신청 정보를 찾을 수 없습니다.')
        if _row_integration_type(row) not in (INTEGRATION_NON_INTEGRATED, INTEGRATION_AD):
            raise ValueError('미연동/AD 신청만 담당 지정을 사용할 수 있습니다.')
        wf = row['workflow_status'] or WORKFLOW_REQUESTED
        if wf != WORKFLOW_ASSIGNED:
            raise ValueError('담당 재지정은 ASSIGNED 상태에서만 가능합니다.')
        now = _now()
        last = conn.execute(
            f'SELECT id FROM {TASK_TABLE} WHERE request_id = ? ORDER BY id DESC LIMIT 1',
            (int(request_id),),
        ).fetchone()
        if last:
            conn.execute(
                f'''UPDATE {TASK_TABLE}
                       SET assignee_org_user_id = ?, updated_at = ?
                     WHERE id = ?''',
                (int(oid), now, int(last['id'])),
            )
        else:
            conn.execute(
                f'''INSERT INTO {TASK_TABLE}
                    (request_id, assignee_org_user_id, status, title, instruction, created_at, updated_at)
                    VALUES (?, ?, 'OPEN', ?, '', ?, ?)''',
                (int(request_id), int(oid), f'RQ-{request_id} 수동 작업', now, now),
            )
        _append_workflow_event(conn, request_id, 'TASK_ASSIGNED', actor, {'assignee_org_user_id': int(oid)})
        conn.commit()
    return get_request(request_id, app=app) or {}


def manual_operator_start(request_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {REQUEST_TABLE} WHERE id = ?', (int(request_id),)).fetchone()
        if not row:
            raise ValueError('신청 정보를 찾을 수 없습니다.')
        if _row_integration_type(row) not in (INTEGRATION_NON_INTEGRATED, INTEGRATION_AD):
            raise ValueError('미연동/AD 신청만 사용할 수 있습니다.')
        wf = row['workflow_status'] or WORKFLOW_REQUESTED
        if wf != WORKFLOW_ASSIGNED:
            raise ValueError('담당 지정(ASSIGNED)된 건만 작업을 시작할 수 있습니다.')
        now = _now()
        conn.execute(
            f'''UPDATE {REQUEST_TABLE} SET workflow_status = ?, updated_at = ? WHERE id = ?''',
            (WORKFLOW_IN_PROGRESS, now, int(request_id)),
        )
        _append_workflow_event(conn, request_id, 'IN_PROGRESS', actor, {})
        conn.commit()
    return get_request(request_id, app=app) or {}


def manual_submit_evidence(request_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {REQUEST_TABLE} WHERE id = ?', (int(request_id),)).fetchone()
        if not row:
            raise ValueError('신청 정보를 찾을 수 없습니다.')
        if _row_integration_type(row) not in (INTEGRATION_NON_INTEGRATED, INTEGRATION_AD):
            raise ValueError('미연동/AD 신청만 사용할 수 있습니다.')
        wf = row['workflow_status'] or WORKFLOW_REQUESTED
        if wf != WORKFLOW_IN_PROGRESS:
            raise ValueError('작업 진행(IN_PROGRESS) 상태에서만 증적 제출할 수 있습니다.')
        if _evidence_attachment_count(conn, request_id) < 1:
            raise ValueError('증적 파일을 먼저 업로드하세요.')
        now = _now()
        conn.execute(
            f'''UPDATE {REQUEST_TABLE} SET workflow_status = ?, updated_at = ? WHERE id = ?''',
            (WORKFLOW_EVIDENCE_UPLOADED, now, int(request_id)),
        )
        _append_workflow_event(conn, request_id, 'EVIDENCE_MARKED', actor, {})
        conn.commit()
    return get_request(request_id, app=app) or {}


def manual_finalize_request(request_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {REQUEST_TABLE} WHERE id = ?', (int(request_id),)).fetchone()
        if not row:
            raise ValueError('신청 정보를 찾을 수 없습니다.')
        if _row_integration_type(row) not in (INTEGRATION_NON_INTEGRATED, INTEGRATION_AD):
            raise ValueError('미연동/AD 신청만 최종 완료할 수 있습니다.')
        wf = row['workflow_status'] or WORKFLOW_REQUESTED
        if wf != WORKFLOW_EVIDENCE_UPLOADED:
            raise ValueError('증적 제출(EVIDENCE_UPLOADED) 이후에만 최종 완료할 수 있습니다.')
        if _evidence_attachment_count(conn, request_id) < 1:
            raise ValueError('증적 파일이 필요합니다.')
        now = _now()
        conn.execute(
            f'''UPDATE {REQUEST_TABLE}
                   SET status = ?, workflow_status = ?, ops_approved_at = COALESCE(ops_approved_at, ?),
                       updated_at = ?
                 WHERE id = ?''',
            (REQUEST_STATUS_APPROVED, WORKFLOW_COMPLETED, now, now, int(request_id)),
        )
        _record_audit(conn, '변경', row['account_name'], actor, '미연동/AD 신청 최종 완료')
        _append_workflow_event(conn, request_id, 'COMPLETED', actor, {})
        conn.commit()
    return get_request(request_id, app=app) or {}


def save_request_attachment(
    request_id: int,
    kind: str,
    filename: str,
    mime_type: str,
    data: bytes,
    actor: str = 'system',
    app=None,
) -> Dict[str, Any]:
    if not kind or not data:
        raise ValueError('첨부 유형과 파일 데이터가 필요합니다.')
    kind_n = _text(kind, 64).upper()
    app = app or current_app
    root = os.path.join(app.instance_path, 'identity_request_uploads')
    os.makedirs(root, exist_ok=True)
    sub = os.path.join(root, str(int(request_id)))
    os.makedirs(sub, exist_ok=True)
    token = uuid.uuid4().hex
    safe_tail = _text(filename.replace('..', '').replace('\\', '').replace('/', ''), 200) or 'upload.bin'
    dest_name = f'{token}_{safe_tail}'
    dest_path = os.path.join(sub, dest_name)
    with open(dest_path, 'wb') as handle:
        handle.write(data)
    now = _now()
    size_b = len(data)
    rel = os.path.join('identity_request_uploads', str(int(request_id)), dest_name)
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT id FROM {REQUEST_TABLE} WHERE id = ?', (int(request_id),)).fetchone()
        if not row:
            raise ValueError('신청 정보를 찾을 수 없습니다.')
        conn.execute(
            f'''INSERT INTO {ATTACHMENT_TABLE}
                (request_id, task_id, kind, storage_path, filename, mime, size_bytes, uploaded_by, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (int(request_id), None, kind_n, rel, safe_tail, _text(mime_type, 128), size_b, _text(actor, 120), now),
        )
        aid = int(conn.execute('SELECT last_insert_rowid()').fetchone()[0])
        _append_workflow_event(conn, request_id, 'ATTACHMENT_ADDED', actor, {'attachment_id': aid, 'kind': kind_n})
        conn.commit()
    return {'id': aid, 'request_id': int(request_id), 'kind': kind_n, 'filename': safe_tail, 'size_bytes': size_b}


def list_request_attachments(request_id: int, app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        rows = conn.execute(
            f'''SELECT id, request_id, task_id, kind, storage_path, filename, mime,
                       size_bytes, uploaded_by, uploaded_at
                  FROM {ATTACHMENT_TABLE}
                 WHERE request_id = ?
                 ORDER BY id ASC''',
            (int(request_id),),
        ).fetchall()
        return {'rows': [dict(r) for r in rows], 'total': len(rows)}


def approve_request(request_id: int, actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {REQUEST_TABLE} WHERE id = ?', (int(request_id),)).fetchone()
        if not row:
            raise ValueError('신청 정보를 찾을 수 없습니다.')
        status = row['status']
        now = _now()
        if status in (REQUEST_STATUS_PENDING, REQUEST_STATUS_SUBMITTED) and row['account_type'] == 'PERSONAL' and not row['admin_approved_at']:
            conn.execute(
                f'''UPDATE {REQUEST_TABLE}
                       SET status = ?, admin_approved_at = ?, workflow_status = ?, updated_at = ?
                     WHERE id = ?''',
                (REQUEST_STATUS_OPS_PENDING, now, WORKFLOW_OPS_PENDING, now, int(request_id)),
            )
            _record_audit(conn, '변경', row['account_name'], actor, 'ADMIN 승인 완료, 운영팀 승인 대기')
            _append_workflow_event(conn, request_id, 'ADMIN_APPROVED', actor, {})
            conn.commit()
            return get_request(request_id, app=app) or {}
        if status == REQUEST_STATUS_APPROVED:
            return get_request(request_id, app=app) or {}
        if status == REQUEST_STATUS_PROCESSING:
            return get_request(request_id, app=app) or {}

        integ = _row_integration_type(row)
        if integ in (INTEGRATION_NON_INTEGRATED, INTEGRATION_AD):
            op_raw = dict(row).get('operator_org_user_id')
            op_id = _as_int(op_raw)
            conn.execute(
                f'''UPDATE {REQUEST_TABLE}
                       SET status = ?, workflow_status = ?, ops_approved_at = ?, updated_at = ?
                     WHERE id = ?''',
                (REQUEST_STATUS_PROCESSING, WORKFLOW_ASSIGNED, now, now, int(request_id)),
            )
            conn.execute(
                f'''INSERT INTO {TASK_TABLE}
                    (request_id, assignee_org_user_id, status, title, instruction, created_at, updated_at)
                    VALUES (?, ?, 'OPEN', ?, '', ?, ?)''',
                (int(request_id), op_id, f'RQ-{request_id} 수동 작업', now, now),
            )
            _record_audit(conn, '변경', row['account_name'], actor, '운영 승인: 수동 처리 큐 진입')
            _append_workflow_event(conn, request_id, 'OPS_APPROVED_MANUAL', actor, {'integration_type': integ})
            conn.commit()
            return get_request(request_id, app=app) or {}

        # INTEGRATED: if operation maps to account job, enqueue job to agent
        action = _op_to_account_job_action(dict(row).get('operation_type') or '')
        if action:
            agent_id = _as_job_agent_id(row)
            if not agent_id:
                raise ValueError('연동 신청은 agent_pending_id(또는 extension.agent_id)가 필요합니다.')
            ok_j, err_j, item = create_account_job(
                agent_id=int(agent_id),
                action=action,
                target_username=_text(row['account_id'], 255),
                payload={'identityRequestId': int(request_id), 'operationType': dict(row).get('operation_type') or action},
                requested_by=actor,
                ttl_minutes=60,
                app=app,
            )
            if not ok_j or not item:
                raise ValueError(f'연동 작업 생성 실패: {err_j}')
            ok_a, err_a = approve_account_job(item['request_id'], approved_by=actor, app=app)
            if not ok_a:
                raise ValueError(f'연동 작업 승인 실패: {err_a}')
            conn.execute(
                f"""UPDATE {REQUEST_TABLE}
                       SET status = ?, workflow_status = ?, ops_approved_at = ?, agent_pending_id = ?, agent_job_request_id = ?, updated_at = ?
                     WHERE id = ?""",
                (REQUEST_STATUS_PROCESSING, WORKFLOW_IN_PROGRESS, now, int(agent_id), item['request_id'], now, int(request_id)),
            )
            _record_audit(conn, '변경', row['account_name'], actor, f'연동 자동 처리 큐잉: {action}')
            _append_workflow_event(conn, request_id, 'AGENT_JOB_ENQUEUED', actor, {'action': action, 'agent_pending_id': int(agent_id), 'job_request_id': item['request_id']})
            conn.commit()
            return get_request(request_id, app=app) or {}

        owner_type = row['target_owner_type']
        owner_id = int(row['target_owner_id'])
        owner = _ensure_owner_policy(conn, row['account_type'], owner_type, owner_id)
        account_row = conn.execute(
            f'''SELECT id FROM {INTEGRATED_TABLE}
                 WHERE is_deleted = 0 AND lower(account_name) = lower(?) LIMIT 1''',
            (row['account_name'],),
        ).fetchone()
        if account_row:
            integrated_id = int(account_row['id'])
        else:
            cur = conn.execute(
                f'''
                INSERT INTO {INTEGRATED_TABLE}
                    (account_name, account_type, owner_type, owner_id, department, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
                ''',
                (row['account_name'], row['account_type'], owner_type, owner_id, owner.get('department') or '', now, now),
            )
            integrated_id = int(cur.lastrowid)
        source = conn.execute(
            f'''SELECT id FROM {SOURCE_TABLE}
                 WHERE is_deleted = 0 AND system_type = ? AND system_name = ? AND account_id = ? AND collection_type = 'MANUAL'
                 LIMIT 1''',
            (row['system_type'], row['system_type'], row['account_id']),
        ).fetchone()
        if source:
            source_id = int(source['id'])
        else:
            cur = conn.execute(
                f'''
                INSERT INTO {SOURCE_TABLE}
                    (system_type, system_name, account_id, access_info, privilege, collection_type, status,
                     source_ref, source_ref_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'MANUAL', 'ACTIVE', 'request', ?, ?, ?)
                ''',
                (row['system_type'], row['system_type'], row['account_id'], '', row['privilege'] or '', int(request_id), now, now),
            )
            source_id = int(cur.lastrowid)
        existing_mapping = conn.execute(
            f'SELECT 1 FROM {ACCOUNT_MAPPING_TABLE} WHERE source_account_id = ? LIMIT 1',
            (source_id,),
        ).fetchone()
        if not existing_mapping:
            _map_source_account(conn, integrated_id, source_id, actor)
        conn.execute(
            f'''UPDATE {REQUEST_TABLE}
                   SET status = ?, ops_approved_at = ?, workflow_status = ?, updated_at = ?
                 WHERE id = ?''',
            (REQUEST_STATUS_APPROVED, now, WORKFLOW_COMPLETED, now, int(request_id)),
        )
        _record_audit(conn, '생성', row['account_name'], actor, '운영팀 승인 및 통합계정 생성 완료')
        _append_workflow_event(conn, request_id, 'INTEGRATED_PROVISION_DONE', actor, {})
        conn.commit()
    return get_request(request_id, app=app) or {}


def reject_request(request_id: int, reason: str = '', actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {REQUEST_TABLE} WHERE id = ?', (int(request_id),)).fetchone()
        if not row:
            raise ValueError('신청 정보를 찾을 수 없습니다.')
        conn.execute(
            f'''UPDATE {REQUEST_TABLE}
                   SET status = ?, rejected_reason = ?, workflow_status = ?, updated_at = ?
                 WHERE id = ?''',
            (REQUEST_STATUS_REJECTED, _text(reason, 1000), WORKFLOW_REJECTED, _now(), int(request_id)),
        )
        _record_audit(conn, '변경', row['account_name'], actor, '통합계정 신청 반려')
        _append_workflow_event(conn, request_id, 'REJECTED', actor, {'reason': _text(reason, 1000)})
        conn.commit()
    return get_request(request_id, app=app) or {}


def list_audit_logs(filters: Optional[Dict[str, Any]] = None, app=None) -> Dict[str, Any]:
    filters = filters or {}
    keyword = _text(filters.get('keyword'), 100).lower()
    action_type = _text(filters.get('action_type'), 40)
    with _get_connection(app) as conn:
        sql = f'SELECT * FROM {AUDIT_TABLE}'
        params: List[Any] = []
        if action_type:
            sql += ' WHERE action_type = ?'
            params.append(action_type)
        sql += ' ORDER BY id DESC LIMIT 1000'
        rows = [dict(row) for row in conn.execute(sql, params).fetchall()]
    if keyword:
        rows = [row for row in rows if keyword in ' '.join([str(v or '').lower() for v in row.values()])]
    return {'rows': rows, 'total': len(rows)}


def sync_ad_groups(actor: str = 'system', app=None) -> Dict[str, int]:
    stats = {'inserted': 0, 'updated': 0}
    with _get_connection(app) as conn:
        if not _table_exists(conn, 'network_ad_policy'):
            return stats
        now = _now()
        rows = conn.execute('SELECT ad_id, domain_name, fqdn, main_groups FROM network_ad_policy ORDER BY ad_id ASC').fetchall()
        for row in rows:
            domain = _text(row['domain_name'] or row['fqdn'] or f"AD#{row['ad_id']}", 255)
            raw_groups = _text(row['main_groups'], 2000)
            for group_name in [part.strip() for part in raw_groups.replace(';', ',').split(',') if part.strip()]:
                existing = conn.execute(
                    f'SELECT * FROM {AD_GROUP_TABLE} WHERE domain_name = ? AND group_name = ?',
                    (domain, group_name),
                ).fetchone()
                if existing:
                    if existing['sync_state'] != 'SYNCED' or existing['status'] != 'ACTIVE':
                        conn.execute(
                            f'''UPDATE {AD_GROUP_TABLE}
                                   SET status = 'ACTIVE', sync_state = 'SYNCED', last_synced_at = ?, updated_at = ?
                                 WHERE id = ?''',
                            (now, now, int(existing['id'])),
                        )
                        stats['updated'] += 1
                else:
                    conn.execute(
                        f'''INSERT INTO {AD_GROUP_TABLE}
                            (group_name, domain_name, group_dn, status, sync_state, last_synced_at, created_at, updated_at)
                            VALUES (?, ?, ?, 'ACTIVE', 'SYNCED', ?, ?, ?)''',
                        (group_name, domain, '', now, now, now),
                    )
                    stats['inserted'] += 1
        if any(stats.values()):
            _record_audit(conn, 'AD동기화', 'AD Group', actor, f'AD 그룹 동기화: {stats}')
        conn.commit()
    return stats


def list_ad_groups(app=None) -> Dict[str, Any]:
    sync_ad_groups(actor='system', app=app)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f'''
            SELECT g.*, a.name AS manager_name, COUNT(m.integrated_account_id) AS mapped_account_count
              FROM {AD_GROUP_TABLE} g
              LEFT JOIN {ADMIN_TABLE} a ON a.id = g.manager_admin_id
              LEFT JOIN {AD_GROUP_MAPPING_TABLE} m ON m.group_id = g.id
             GROUP BY g.id
             ORDER BY g.domain_name, g.group_name
            '''
        ).fetchall()
        return {'rows': [dict(row) for row in rows], 'total': len(rows)}


def save_ad_group(payload: Dict[str, Any], actor: str = 'system', app=None) -> Dict[str, Any]:
    group_name = _text(payload.get('group_name'), 255)
    if not group_name:
        raise ValueError('그룹명을 입력하세요.')
    with _get_connection(app) as conn:
        now = _now()
        cur = conn.execute(
            f'''INSERT INTO {AD_GROUP_TABLE}
                (group_name, domain_name, group_dn, manager_admin_id, status, sync_state, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'MANUAL', ?, ?)''',
            (
                group_name,
                _text(payload.get('domain_name'), 255),
                _text(payload.get('group_dn'), 1000),
                _as_int(payload.get('manager_admin_id')),
                _normalize_status(payload.get('status')),
                now,
                now,
            ),
        )
        _record_audit(conn, '변경', group_name, actor, 'AD 그룹 추가')
        conn.commit()
        row = conn.execute(f'SELECT * FROM {AD_GROUP_TABLE} WHERE id = ?', (int(cur.lastrowid),)).fetchone()
        return dict(row)


def map_ad_group(group_id: int, integrated_account_id: int, permission_level: str = '', actor: str = 'system', app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        group = conn.execute(f'SELECT * FROM {AD_GROUP_TABLE} WHERE id = ?', (int(group_id),)).fetchone()
        account = conn.execute(f'SELECT * FROM {INTEGRATED_TABLE} WHERE id = ? AND is_deleted = 0', (int(integrated_account_id),)).fetchone()
        if not group or not account:
            raise ValueError('AD 그룹 또는 통합계정을 찾을 수 없습니다.')
        conn.execute(
            f'''INSERT OR REPLACE INTO {AD_GROUP_MAPPING_TABLE}
                (group_id, integrated_account_id, permission_level, created_at, created_by)
                VALUES (?, ?, ?, ?, ?)''',
            (int(group_id), int(integrated_account_id), _text(permission_level, 255), _now(), actor),
        )
        _record_audit(conn, '매핑', account['account_name'], actor, f"AD 그룹 매핑: {group['group_name']}")
        conn.commit()
    return list_ad_groups(app=app)


def create_access_review(payload: Dict[str, Any], actor: str = 'system', app=None) -> Dict[str, Any]:
    admin_id = _as_int(payload.get('admin_id'))
    review_name = _text(payload.get('review_name'), 255)
    if not review_name:
        review_name = f"정기 권한 검토 {datetime.utcnow().strftime('%Y-%m-%d')}"
    due_date = _text(payload.get('due_date'), 20)
    if not due_date:
        due_date = (datetime.utcnow() + timedelta(days=14)).strftime('%Y-%m-%d')
    with _get_connection(app) as conn:
        now = _now()
        cur = conn.execute(
            f'''INSERT INTO {ACCESS_REVIEW_TABLE}
                (review_name, admin_id, status, due_date, result, created_at, updated_at)
                VALUES (?, ?, '대기', ?, '', ?, ?)''',
            (review_name, admin_id, due_date, now, now),
        )
        review_id = int(cur.lastrowid)
        if admin_id:
            accounts = conn.execute(
                f'''SELECT ia.id AS integrated_account_id, s.id AS source_account_id
                      FROM {INTEGRATED_TABLE} ia
                      LEFT JOIN {ACCOUNT_MAPPING_TABLE} m ON m.integrated_account_id = ia.id
                      LEFT JOIN {SOURCE_TABLE} s ON s.id = m.source_account_id AND s.is_deleted = 0
                     WHERE ia.is_deleted = 0
                       AND ((ia.owner_type = 'ADMIN' AND ia.owner_id = ?)
                            OR (ia.owner_type = 'USER' AND ia.owner_id IN (
                                SELECT user_id FROM {ADMIN_USER_TABLE} WHERE admin_id = ?
                            )))''',
                (int(admin_id), int(admin_id)),
            ).fetchall()
        else:
            accounts = conn.execute(
                f'''SELECT ia.id AS integrated_account_id, s.id AS source_account_id
                      FROM {INTEGRATED_TABLE} ia
                      LEFT JOIN {ACCOUNT_MAPPING_TABLE} m ON m.integrated_account_id = ia.id
                      LEFT JOIN {SOURCE_TABLE} s ON s.id = m.source_account_id AND s.is_deleted = 0
                     WHERE ia.is_deleted = 0'''
            ).fetchall()
        for account in accounts:
            conn.execute(
                f'''INSERT INTO {ACCESS_REVIEW_ITEM_TABLE}
                    (review_id, integrated_account_id, source_account_id, result, created_at, updated_at)
                    VALUES (?, ?, ?, '유지', ?, ?)''',
                (review_id, account['integrated_account_id'], account['source_account_id'], now, now),
            )
        _record_audit(conn, '변경', review_name, actor, '권한 검토 요청 생성')
        conn.commit()
    return get_access_review(review_id, app=app) or {}


def get_access_review(review_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = conn.execute(
            f'''SELECT r.*, a.name AS admin_name
                  FROM {ACCESS_REVIEW_TABLE} r
                  LEFT JOIN {ADMIN_TABLE} a ON a.id = r.admin_id
                 WHERE r.id = ?''',
            (int(review_id),),
        ).fetchone()
        if not row:
            return None
        item = dict(row)
        item_rows = conn.execute(
            f'''
            SELECT ri.*, ia.account_name, ia.account_type, s.system_type, s.system_name, s.account_id, s.privilege
              FROM {ACCESS_REVIEW_ITEM_TABLE} ri
              LEFT JOIN {INTEGRATED_TABLE} ia ON ia.id = ri.integrated_account_id
              LEFT JOIN {SOURCE_TABLE} s ON s.id = ri.source_account_id
             WHERE ri.review_id = ?
             ORDER BY ia.account_name, s.system_type, s.system_name
            ''',
            (int(review_id),),
        ).fetchall()
        item['items'] = [dict(item_row) for item_row in item_rows]
        return item


def list_access_reviews(app=None) -> Dict[str, Any]:
    with _get_connection(app) as conn:
        rows = conn.execute(
            f'''SELECT r.*, a.name AS admin_name, COUNT(i.id) AS item_count
                  FROM {ACCESS_REVIEW_TABLE} r
                  LEFT JOIN {ADMIN_TABLE} a ON a.id = r.admin_id
                  LEFT JOIN {ACCESS_REVIEW_ITEM_TABLE} i ON i.review_id = r.id
                 GROUP BY r.id
                 ORDER BY r.id DESC'''
        ).fetchall()
        return {'rows': [dict(row) for row in rows], 'total': len(rows)}


def update_access_review_result(review_id: int, result: str, actor: str = 'system', app=None) -> Dict[str, Any]:
    result = _text(result or '유지', 40)
    if result not in ('유지', '제거', '변경'):
        raise ValueError('검토 결과는 유지, 제거, 변경 중 하나여야 합니다.')
    with _get_connection(app) as conn:
        row = conn.execute(f'SELECT * FROM {ACCESS_REVIEW_TABLE} WHERE id = ?', (int(review_id),)).fetchone()
        if not row:
            raise ValueError('권한 검토 정보를 찾을 수 없습니다.')
        conn.execute(
            f'''UPDATE {ACCESS_REVIEW_TABLE}
                   SET status = '완료', result = ?, updated_at = ?
                 WHERE id = ?''',
            (result, _now(), int(review_id)),
        )
        _record_audit(conn, '변경', row['review_name'], actor, f'권한 검토 결과: {result}')
        conn.commit()
    return get_access_review(review_id, app=app) or {}
