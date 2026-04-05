import json
import logging
import os
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'network_dns_policy_log'
POLICY_TABLE = 'network_dns_policy'

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('NETWORK_DNS_POLICY_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'network_dns_policy.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'network_dns_policy.db')
    if netloc and netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    path = path.lstrip('/')
    if os.path.isabs(path):
        return path
    return os.path.abspath(os.path.join(_project_root(app), path))


def _ensure_parent_dir(path: str) -> None:
    directory = os.path.dirname(path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)


def _get_connection(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = _resolve_db_path(app)
    _ensure_parent_dir(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _format_datetime_kst(value: Any) -> str:
    raw = (value or '').strip() if isinstance(value, str) else None
    if not raw:
        return ''
    try:
        # SQLite CURRENT_TIMESTAMP -> UTC
        dt = datetime.strptime(raw, '%Y-%m-%d %H:%M:%S')
        dt = dt + timedelta(hours=9)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return raw


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    diff = None
    raw = row['diff_json'] if 'diff_json' in row.keys() else None
    if raw:
        try:
            diff = json.loads(raw)
        except Exception:
            diff = None
    return {
        'log_id': row['log_id'],
        'policy_id': row['policy_id'],
        'tab_key': row['tab_key'],
        'entity': row['entity'],
        'entity_id': row['entity_id'],
        'action': row['action'],
        'actor': row['actor'],
        'message': row['message'],
        'reason': (row['reason'] or '') if 'reason' in row.keys() else '',
        'diff': diff,
        'created_at': _format_datetime_kst(row['created_at']),
    }


def _normalize_keys(obj: Dict[str, Any], mapping: Dict[str, str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in (obj or {}).items():
        key = str(k)
        out[mapping.get(key, key)] = v
    return out


def _coerce_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _compute_changes_from_payload(before: Dict[str, Any], after: Dict[str, Any], payload: Dict[str, Any], allowed_keys: set) -> Dict[str, Any]:
    changes: Dict[str, Any] = {}
    for raw_key in payload.keys():
        key = str(raw_key)
        if key not in allowed_keys:
            continue
        b = before.get(key)
        a = after.get(key)
        if b != a:
            changes[key] = {'before': b, 'after': a}
    return changes


def _apply_payload(state: Dict[str, Any], payload: Dict[str, Any], allowed_keys: set) -> Dict[str, Any]:
    for raw_key, val in payload.items():
        key = str(raw_key)
        if key not in allowed_keys:
            continue
        state[key] = val
    return state


def _backfill_diff_changes_for_legacy_updates(
    conn: sqlite3.Connection,
    policy_id: int,
    row: sqlite3.Row,
    diff: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Return an updated diff dict with `changes/changed_fields` filled in, when possible."""
    try:
        tab_key = (row['tab_key'] or '').strip()
        action = (row['action'] or '').strip().upper()
        entity_id = row['entity_id']
        if action != 'UPDATE':
            return None
        if tab_key not in ('gov_dns_policy_dns_record', 'gov_dns_policy_file'):
            return None
        if not entity_id:
            return None

        d = _coerce_dict(diff)
        if isinstance(d.get('changes'), dict) and d.get('changes'):
            return None

        payload = _coerce_dict(d.get('payload'))
        if not payload:
            return None

        if tab_key == 'gov_dns_policy_dns_record':
            mapping = {
                'recordType': 'record_type',
                'hostName': 'host_name',
                'ipAddress': 'ip_address',
                'serviceName': 'service_name',
            }
            allowed = {
                'fqdn', 'host', 'host_name', 'record_type',
                'ip_address', 'priority', 'ttl', 'service_name', 'remark',
                'status', 'enabled', 'is_active',
            }
        else:
            mapping = {
                'fileName': 'file_name',
                'originalFilename': 'original_filename',
                'isPrimary': 'is_primary',
            }
            allowed = {
                'entry_type', 'type',
                'title', 'description', 'note', 'remark',
                'file_name', 'original_filename', 'file_size', 'mime_type',
                'is_primary',
            }

        payload_n = _normalize_keys(payload, mapping)

        # Find the earliest CREATE snapshot for this entity.
        create_row = conn.execute(
            f"""
            SELECT * FROM {TABLE_NAME}
            WHERE policy_id = ? AND tab_key = ? AND entity_id = ? AND action = 'CREATE'
            ORDER BY created_at ASC, log_id ASC
            LIMIT 1
            """,
            (int(policy_id), tab_key, int(entity_id)),
        ).fetchone()
        if not create_row:
            return None

        create_diff: Dict[str, Any] = {}
        raw_cd = create_row['diff_json']
        if raw_cd:
            try:
                create_diff = json.loads(raw_cd) or {}
            except Exception:
                create_diff = {}
        seed_item = _coerce_dict(create_diff.get('item'))
        if not seed_item:
            return None

        # Build state by replaying UPDATE payloads from CREATE -> just before this log.
        state: Dict[str, Any] = {k: seed_item.get(k) for k in allowed if k in seed_item}

        cur_created_at = row['created_at']
        cur_log_id = row['log_id']

        between_rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_NAME}
            WHERE policy_id = ? AND tab_key = ? AND entity_id = ?
              AND (created_at > ? OR (created_at = ? AND log_id > ?))
              AND (created_at < ? OR (created_at = ? AND log_id < ?))
            ORDER BY created_at ASC, log_id ASC
            """,
            (
                int(policy_id), tab_key, int(entity_id),
                create_row['created_at'], create_row['created_at'], int(create_row['log_id']),
                cur_created_at, cur_created_at, int(cur_log_id),
            ),
        ).fetchall()

        for r in between_rows:
            if (r['action'] or '').strip().upper() != 'UPDATE':
                continue
            raw = r['diff_json']
            if not raw:
                continue
            try:
                dd = json.loads(raw) or {}
            except Exception:
                continue
            pp = _normalize_keys(_coerce_dict(dd.get('payload')), mapping)
            if not pp:
                continue
            _apply_payload(state, {k: pp.get(k) for k in pp.keys() if k in allowed}, allowed)

        before = dict(state)
        after = dict(state)
        _apply_payload(after, {k: payload_n.get(k) for k in payload_n.keys() if k in allowed}, allowed)
        changes = _compute_changes_from_payload(before, after, payload_n, allowed)

        # Even if no actual values changed (e.g., user clicked save with no edits),
        # mark the diff as resolved so the UI can show “데이터 0개 수정” and not fall
        # back to dumping raw payload/meta fields.
        d['changes'] = changes or {}
        d['changed_fields'] = len(changes)
        return d
    except Exception:
        logger.exception('Failed to backfill DNS legacy update diff')
        return None


def init_network_dns_policy_log_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                policy_id INTEGER NOT NULL,
                tab_key TEXT NOT NULL,
                entity TEXT NOT NULL,
                entity_id INTEGER,
                action TEXT NOT NULL,
                actor TEXT NOT NULL,
                message TEXT,
                reason TEXT,
                diff_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        try:
            cols = {r['name'] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
            if 'reason' not in cols:
                conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN reason TEXT")
        except Exception:
            logger.exception('Failed to ensure %s.reason column', TABLE_NAME)
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_policy ON {TABLE_NAME}(policy_id)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_created ON {TABLE_NAME}(created_at)")
        conn.commit()


def append_network_dns_policy_log(
    policy_id: int,
    *,
    tab_key: str,
    entity: str,
    entity_id: Optional[int] = None,
    action: str,
    actor: str,
    message: str,
    diff: Optional[Dict[str, Any]] = None,
    app=None,
) -> None:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = json.dumps(diff, ensure_ascii=False) if diff else None
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (policy_id, tab_key, entity, entity_id, action, actor, message, diff_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(policy_id),
                (tab_key or '').strip() or 'gov_dns_policy_detail',
                (entity or 'POLICY').strip() or 'POLICY',
                int(entity_id) if entity_id is not None else None,
                (action or '').strip().upper() or 'UPDATE',
                actor,
                (message or '').strip() or None,
                payload,
            ),
        )
        conn.commit()


def list_network_dns_policy_logs(
    policy_id: int,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_NAME}
            WHERE policy_id = ?
            ORDER BY created_at DESC, log_id DESC
            LIMIT ? OFFSET ?
            """,
            (int(policy_id), page_size, offset),
        ).fetchall()

        def _resolve_policy_domain(pid: int) -> str:
            try:
                rr = conn.execute(
                    f"SELECT domain FROM {POLICY_TABLE} WHERE id = ?",
                    (int(pid),),
                ).fetchone()
                if rr and 'domain' in rr.keys():
                    return (rr['domain'] or '').strip()
            except Exception:
                return ''
            return ''

        def _rewrite_message_for_display(item: Dict[str, Any]) -> None:
            try:
                tab_key = (item.get('tab_key') or '').strip()
                action = (item.get('action') or '').strip().upper()
                msg = (item.get('message') or '').strip()
                diff = item.get('diff') if isinstance(item.get('diff'), dict) else {}
                if not isinstance(diff, dict):
                    diff = {}

                if tab_key == 'gov_dns_policy_file' and action == 'CREATE':
                    # "DNS 구성/파일 등록" -> "구성/파일 등록 (filename)"
                    if msg == 'DNS 구성/파일 등록' or msg == '구성/파일 등록':
                        it = diff.get('item') if isinstance(diff.get('item'), dict) else {}
                        filename = ''
                        for k in ('original_filename', 'originalFilename', 'file_name', 'fileName'):
                            v = it.get(k)
                            if isinstance(v, str) and v.strip():
                                filename = v.strip()
                                break
                        item['message'] = f"구성/파일 등록 ({filename})" if filename else '구성/파일 등록'

                if tab_key == 'gov_dns_policy_dns_record' and action == 'CREATE':
                    # "DNS 레코드 등록" -> "도메인 {fqdn} 레코드 등록"
                    if msg == 'DNS 레코드 등록' or msg.startswith('도메인 ') or msg == '레코드 등록':
                        it = diff.get('item') if isinstance(diff.get('item'), dict) else {}
                        fqdn = (it.get('fqdn') or '').strip() if isinstance(it.get('fqdn'), str) else ''
                        if not fqdn:
                            host = ''
                            for k in ('host_name', 'host'):
                                v = it.get(k)
                                if isinstance(v, str) and v.strip():
                                    host = v.strip()
                                    break
                            domain = _resolve_policy_domain(int(item.get('policy_id') or 0))
                            if domain:
                                if host in ('', '@'):
                                    fqdn = domain
                                elif host:
                                    fqdn = f"{host}.{domain}".replace('..', '.').strip('.')
                        if fqdn:
                            item['message'] = f"도메인 {fqdn} 레코드 등록"
                        else:
                            item['message'] = 'DNS 레코드 등록'
            except Exception:
                return

        # Backfill missing `changes` for legacy UPDATE logs on record/file tabs.
        fixed_items: List[Dict[str, Any]] = []
        for r in rows:
            item = _row_to_dict(r)
            diff = item.get('diff') if isinstance(item, dict) else None
            if isinstance(diff, dict):
                updated = _backfill_diff_changes_for_legacy_updates(conn, int(policy_id), r, diff)
                if updated is not None:
                    item['diff'] = updated
            if isinstance(item, dict):
                _rewrite_message_for_display(item)
            fixed_items.append(item)

        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE policy_id = ?",
            (int(policy_id),),
        ).fetchone()[0]
    return {
        'items': fixed_items,
        'total': int(total or 0),
        'page': page,
        'page_size': page_size,
    }


def update_network_dns_policy_log_reason(
    policy_id: int,
    log_id: int,
    *,
    reason: str,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    rid = int(log_id)
    pid = int(policy_id)
    reason_text = (reason or '').strip()
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT log_id FROM {TABLE_NAME} WHERE policy_id = ? AND log_id = ?",
            (pid, rid),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            f"UPDATE {TABLE_NAME} SET reason = ? WHERE policy_id = ? AND log_id = ?",
            (reason_text, pid, rid),
        )
        conn.commit()
        updated = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE policy_id = ? AND log_id = ?",
            (pid, rid),
        ).fetchone()
    return _row_to_dict(updated)
