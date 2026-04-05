import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'network_ip_diagram'
POLICY_TABLE = 'network_ip_policy'
VALID_ENTRY_TYPES = {'DIAGRAM', 'ATTACHMENT', 'REFERENCE'}
DEFAULT_ENTRY_TYPE = 'ATTACHMENT'
ORDER_BY_SQL = 'sort_order ASC, id DESC'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('NETWORK_IP_POLICY_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'network_ip_policy.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'network_ip_policy.db')
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
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except sqlite3.DatabaseError:
        logger.warning('Could not enable FK enforcement for network_ip_diagram table')
    return conn


def _normalize_entry_type(value: Optional[str]) -> str:
    if not value:
        return DEFAULT_ENTRY_TYPE
    token = str(value).strip().upper()
    if token in VALID_ENTRY_TYPES:
        return token
    if token in {'DIAGRAMS', 'DIAGRAM_FILE', 'PRIMARY'}:
        return 'DIAGRAM'
    if token in {'FILES', 'ATTACHMENTS'}:
        return 'ATTACHMENT'
    return DEFAULT_ENTRY_TYPE


def _sanitize_int(value: Any, default: int = 0) -> int:
    if value in (None, ''):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else 0


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    token = str(value).strip().lower()
    return token in {'1', 'true', 'yes', 'y', 'on'}


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        'id': row['id'],
        'policy_id': row['policy_id'],
        'entry_type': row['entry_type'],
        'title': row['title'] or '',
        'kind': row['kind'] or '',
        'description': row['description'] or '',
        'file_name': row['file_name'] or '',
        'file_path': row['file_path'] or '',
        'file_size': row['file_size'] or 0,
        'mime_type': row['mime_type'] or '',
        'is_primary': bool(row['is_primary']),
        'sort_order': row['sort_order'] or 0,
        'upload_token': row['upload_token'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def init_network_ip_diagram_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    policy_id INTEGER NOT NULL,
                    entry_type TEXT NOT NULL DEFAULT 'ATTACHMENT',
                    title TEXT,
                    kind TEXT,
                    description TEXT,
                    file_name TEXT NOT NULL,
                    file_path TEXT,
                    file_size INTEGER DEFAULT 0,
                    mime_type TEXT,
                    is_primary INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER DEFAULT 0,
                    upload_token TEXT,
                    created_by TEXT,
                    updated_by TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (policy_id) REFERENCES {POLICY_TABLE}(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_policy ON {TABLE_NAME}(policy_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_type ON {TABLE_NAME}(entry_type)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize network_ip_diagram table')
        raise


def _fetch_row(diagram_id: int, conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    return conn.execute(
        f"SELECT id, policy_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_at, created_by, updated_at, updated_by FROM {TABLE_NAME} WHERE id = ?",
        (diagram_id,),
    ).fetchone()


def list_network_ip_diagrams(
    policy_id: int,
    *,
    entry_type: Optional[str] = None,
    is_primary: Optional[bool] = None,
    app=None,
) -> List[Dict[str, Any]]:
    if not policy_id:
        return []
    clauses = ['policy_id = ?']
    params: List[Any] = [policy_id]
    if entry_type:
        clauses.append('entry_type = ?')
        params.append(_normalize_entry_type(entry_type))
    if is_primary is not None:
        clauses.append('is_primary = ?')
        params.append(1 if is_primary else 0)
    where_sql = ' AND '.join(clauses)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT id, policy_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_at, created_by, updated_at, updated_by FROM {TABLE_NAME} WHERE {where_sql} ORDER BY {ORDER_BY_SQL}",
            params,
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


def get_network_ip_diagram(diagram_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = _fetch_row(diagram_id, conn)
        return _row_to_dict(row) if row else None


def _ensure_policy_exists(policy_id: int, conn: sqlite3.Connection) -> None:
    exists = conn.execute(
        f"SELECT 1 FROM {POLICY_TABLE} WHERE id = ?",
        (policy_id,),
    ).fetchone()
    if not exists:
        raise ValueError('IP 정책을 찾을 수 없습니다.')


def _prepare_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    policy_id = data.get('policy_id') or data.get('policyId')
    try:
        payload['policy_id'] = int(policy_id)
    except (TypeError, ValueError):
        payload['policy_id'] = 0
    if not payload['policy_id']:
        raise ValueError('policy_id is required.')

    entry_type = _normalize_entry_type(data.get('entry_type') or data.get('type'))
    payload['entry_type'] = entry_type

    file_name = (data.get('file_name') or data.get('fileName') or data.get('name') or '').strip()
    if not file_name:
        raise ValueError('파일명을 입력하세요.')
    payload['file_name'] = file_name

    title = (data.get('title') or data.get('label') or file_name).strip()
    payload['title'] = title or file_name

    payload['description'] = (data.get('description') or data.get('desc') or data.get('note') or '').strip() or None
    payload['file_path'] = (data.get('file_path') or data.get('path') or '').strip() or None
    payload['mime_type'] = (data.get('mime_type') or data.get('content_type') or data.get('contentType') or '').strip() or None
    payload['kind'] = (data.get('kind') or data.get('category') or '').strip() or None
    payload['upload_token'] = (data.get('upload_token') or data.get('uploadToken') or data.get('file_token') or data.get('fileToken') or '').strip() or None
    payload['file_size'] = _sanitize_int(data.get('file_size') or data.get('size'), 0)
    payload['sort_order'] = _sanitize_int(data.get('sort_order') or data.get('order'), 0)

    if 'is_primary' in data:
        payload['is_primary'] = 1 if _to_bool(data.get('is_primary')) else 0
    elif entry_type == 'DIAGRAM':
        payload['is_primary'] = 1
    else:
        payload['is_primary'] = 0

    return payload


def create_network_ip_diagram(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    if not data:
        raise ValueError('요청 본문이 비어 있습니다.')
    payload = _prepare_payload(data)
    actor_name = (actor or 'system').strip() or 'system'
    timestamp = _now()
    app = app or current_app
    with _get_connection(app) as conn:
        _ensure_policy_exists(payload['policy_id'], conn)
        if payload['is_primary'] and payload['entry_type'] == 'DIAGRAM':
            conn.execute(
                f"UPDATE {TABLE_NAME} SET is_primary = 0 WHERE policy_id = ?",
                (payload['policy_id'],),
            )
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (policy_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_by, updated_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload['policy_id'],
                payload['entry_type'],
                payload['title'],
                payload['kind'],
                payload['description'],
                payload['file_name'],
                payload['file_path'],
                payload['file_size'],
                payload['mime_type'],
                payload['is_primary'],
                payload['sort_order'],
                payload['upload_token'],
                actor_name,
                actor_name,
                timestamp,
                timestamp,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        row = _fetch_row(new_id, conn)
    record = _row_to_dict(row)
    try:
        from app.services.network_ip_policy_service import append_network_ip_policy_log

        append_network_ip_policy_log(
            record.get('policy_id') or payload['policy_id'],
            tab_key='gov_ip_policy_file',
            entity='DIAGRAM',
            entity_id=record.get('id') or None,
            action='CREATE',
            actor=actor_name,
            message=f"구성/파일 등록: {record.get('file_name') or ''}".strip(),
            diff={
                'created': record,
            },
            app=app,
        )
    except Exception:
        logger.exception('Failed to append network ip diagram create log')
    return record


def update_network_ip_diagram(diagram_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    if not data:
        return get_network_ip_diagram(diagram_id, app)
    actor_name = (actor or 'system').strip() or 'system'
    updates: List[str] = []
    params: List[Any] = []

    def set_text(column: str, *keys: str) -> None:
        for key in keys:
            if key in data:
                value = (data.get(key) or '').strip()
                updates.append(f"{column} = ?")
                params.append(value or None)
                return

    set_text('title', 'title', 'label', 'name')
    set_text('description', 'description', 'desc', 'note')
    if any(key in data for key in ('file_name', 'fileName', 'name')):
        candidate = (data.get('file_name') or data.get('fileName') or data.get('name') or '').strip()
        if not candidate:
            raise ValueError('파일명을 입력하세요.')
        updates.append('file_name = ?')
        params.append(candidate)
    set_text('file_path', 'file_path', 'path')
    set_text('mime_type', 'mime_type', 'content_type', 'contentType')
    set_text('kind', 'kind', 'category')
    set_text('upload_token', 'upload_token', 'uploadToken', 'file_token', 'fileToken')

    if 'entry_type' in data or 'type' in data:
        updates.append('entry_type = ?')
        params.append(_normalize_entry_type(data.get('entry_type') or data.get('type')))
    if 'file_size' in data or 'size' in data:
        updates.append('file_size = ?')
        params.append(_sanitize_int(data.get('file_size') or data.get('size'), 0))
    if 'sort_order' in data or 'order' in data:
        updates.append('sort_order = ?')
        params.append(_sanitize_int(data.get('sort_order') or data.get('order'), 0))

    make_primary: Optional[bool] = None
    if 'is_primary' in data:
        value = _to_bool(data.get('is_primary'))
        updates.append('is_primary = ?')
        params.append(1 if value else 0)
        make_primary = value

    if not updates:
        return get_network_ip_diagram(diagram_id, app)

    app = app or current_app
    with _get_connection(app) as conn:
        existing = _fetch_row(diagram_id, conn)
        if not existing:
            return None
        before = _row_to_dict(existing)
        if make_primary and existing['policy_id']:
            conn.execute(
                f"UPDATE {TABLE_NAME} SET is_primary = 0 WHERE policy_id = ? AND id != ?",
                (existing['policy_id'], diagram_id),
            )
        updates.append('updated_by = ?')
        params.append(actor_name)
        updates.append('updated_at = ?')
        params.append(_now())
        params.append(diagram_id)
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        conn.commit()
        row = _fetch_row(diagram_id, conn)
    record = _row_to_dict(row)
    try:
        from app.services.network_ip_policy_service import append_network_ip_policy_log

        changed_fields: Dict[str, Any] = {}
        for key in (
            'entry_type',
            'title',
            'kind',
            'description',
            'file_name',
            'file_path',
            'file_size',
            'mime_type',
            'is_primary',
            'sort_order',
            'upload_token',
        ):
            if before.get(key) != record.get(key):
                changed_fields[key] = {'before': before.get(key), 'after': record.get(key)}

        if changed_fields:
            append_network_ip_policy_log(
                record.get('policy_id') or before.get('policy_id') or 0,
                tab_key='gov_ip_policy_file',
                entity='DIAGRAM',
                entity_id=record.get('id') or diagram_id,
                action='UPDATE',
                actor=actor_name,
                message=f"구성/파일 수정: {record.get('file_name') or before.get('file_name') or ''}".strip(),
                diff={
                    'changed': changed_fields,
                },
                app=app,
            )
    except Exception:
        logger.exception('Failed to append network ip diagram update log')
    return record


def delete_network_ip_diagrams(ids: Sequence[int], actor: Optional[str] = None, app=None) -> int:
    if not ids:
        return 0
    actor_name = (actor or 'system').strip() or 'system'
    normalized: List[int] = []
    for value in ids:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue
        if parsed > 0:
            normalized.append(parsed)
    if not normalized:
        return 0
    placeholders = ','.join('?' for _ in normalized)
    with _get_connection(app) as conn:
        before_rows = conn.execute(
            f"SELECT id, policy_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_at, created_by, updated_at, updated_by FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            normalized,
        ).fetchall()
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            normalized,
        )
        conn.commit()
        deleted = cur.rowcount or 0

    if deleted and before_rows:
        deleted_items = [_row_to_dict(row) for row in before_rows]
        policy_ids = sorted({item.get('policy_id') for item in deleted_items if item.get('policy_id')})
        for policy_id in policy_ids:
            items_for_policy = [item for item in deleted_items if item.get('policy_id') == policy_id]
            try:
                from app.services.network_ip_policy_service import append_network_ip_policy_log

                append_network_ip_policy_log(
                    int(policy_id),
                    tab_key='gov_ip_policy_file',
                    entity='DIAGRAM',
                    action='DELETE',
                    actor=actor_name,
                    message=f"구성/파일 삭제 ({len(items_for_policy)}건)",
                    diff={
                        'deleted': items_for_policy,
                    },
                    app=app,
                )
            except Exception:
                logger.exception('Failed to append network ip diagram delete log')

    return deleted
