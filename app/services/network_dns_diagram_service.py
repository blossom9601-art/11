import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'network_dns_diagram'
POLICY_TABLE = 'network_dns_policy'
VALID_ENTRY_TYPES = {'DIAGRAM', 'ATTACHMENT', 'REFERENCE'}
DEFAULT_ENTRY_TYPE = 'ATTACHMENT'
ORDER_BY_SQL = 'sort_order ASC, id DESC'


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
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except sqlite3.DatabaseError:
        logger.warning('Could not enable FK enforcement for %s', TABLE_NAME)
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


def init_network_dns_diagram_table(app=None) -> None:
    app = app or current_app
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
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_policy ON {TABLE_NAME}(policy_id)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_type ON {TABLE_NAME}(entry_type)")
        conn.commit()


def _fetch_row(diagram_id: int, conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    return conn.execute(
        f"SELECT id, policy_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_at, created_by, updated_at, updated_by FROM {TABLE_NAME} WHERE id = ?",
        (diagram_id,),
    ).fetchone()


def list_network_dns_diagrams(
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
    return [_row_to_dict(r) for r in rows]


def get_network_dns_diagram(diagram_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = _fetch_row(diagram_id, conn)
        return _row_to_dict(row) if row else None


def _ensure_policy_exists(policy_id: int, conn: sqlite3.Connection) -> None:
    exists = conn.execute(
        f"SELECT 1 FROM {POLICY_TABLE} WHERE id = ?",
        (policy_id,),
    ).fetchone()
    if not exists:
        raise ValueError('DNS 정책을 찾을 수 없습니다.')


def _prepare_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    policy_id = data.get('policy_id') or data.get('policyId')
    try:
        payload['policy_id'] = int(policy_id)
    except (TypeError, ValueError):
        payload['policy_id'] = 0
    if not payload['policy_id']:
        raise ValueError('policy_id is required.')

    payload['entry_type'] = _normalize_entry_type(data.get('entry_type') or data.get('entryType'))
    payload['title'] = (data.get('title') or '').strip() or None
    payload['kind'] = (data.get('kind') or '').strip() or None
    payload['description'] = (data.get('description') or '').strip() or None

    file_name = (data.get('file_name') or data.get('fileName') or '').strip()
    if not file_name:
        raise ValueError('file_name is required.')
    payload['file_name'] = file_name

    payload['file_path'] = (data.get('file_path') or data.get('filePath') or '').strip() or None
    payload['file_size'] = _sanitize_int(data.get('file_size') or data.get('fileSize') or 0, 0)
    payload['mime_type'] = (data.get('mime_type') or data.get('mimeType') or '').strip() or None
    payload['is_primary'] = 1 if _to_bool(data.get('is_primary') or data.get('isPrimary') or False) else 0
    payload['sort_order'] = _sanitize_int(data.get('sort_order') or data.get('sortOrder') or 0, 0)
    payload['upload_token'] = (data.get('upload_token') or data.get('uploadToken') or '').strip() or None

    return payload


def create_network_dns_diagram(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data)
    now = _now()

    with _get_connection(app) as conn:
        _ensure_policy_exists(payload['policy_id'], conn)

        if payload['entry_type'] == 'DIAGRAM' and payload['is_primary']:
            conn.execute(
                f"UPDATE {TABLE_NAME} SET is_primary = 0, updated_at = ?, updated_by = ? WHERE policy_id = ? AND entry_type = 'DIAGRAM'",
                (now, actor, payload['policy_id']),
            )

        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
              (policy_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_by, updated_by, created_at, updated_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                actor,
                actor,
                now,
                now,
            ),
        )
        diagram_id = int(cur.lastrowid)
        conn.commit()
        row = _fetch_row(diagram_id, conn)

    return _row_to_dict(row) if row else {}


def update_network_dns_diagram(diagram_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    now = _now()

    with _get_connection(app) as conn:
        existing = _fetch_row(int(diagram_id), conn)
        if not existing:
            return None
        payload = _prepare_payload({**data, 'policy_id': existing['policy_id']})

        if payload['entry_type'] == 'DIAGRAM' and payload['is_primary']:
            conn.execute(
                f"UPDATE {TABLE_NAME} SET is_primary = 0, updated_at = ?, updated_by = ? WHERE policy_id = ? AND entry_type = 'DIAGRAM' AND id != ?",
                (now, actor, payload['policy_id'], int(diagram_id)),
            )

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET entry_type = ?, title = ?, kind = ?, description = ?, file_name = ?, file_path = ?, file_size = ?, mime_type = ?,
                is_primary = ?, sort_order = ?, upload_token = ?, updated_by = ?, updated_at = ?
            WHERE id = ?
            """,
            (
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
                actor,
                now,
                int(diagram_id),
            ),
        )
        conn.commit()
        row = _fetch_row(int(diagram_id), conn)

    return _row_to_dict(row) if row else None


def delete_network_dns_diagrams(ids: List[int], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    cleaned = [int(x) for x in (ids or []) if str(x).strip().isdigit()]
    if not cleaned:
        return 0
    with _get_connection(app) as conn:
        placeholders = ','.join(['?'] * len(cleaned))
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            cleaned,
        )
        conn.commit()
        return int(cur.rowcount or 0)
