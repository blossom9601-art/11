import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'tab15_file_entry'
VALID_ENTRY_TYPES = {'DIAGRAM', 'ATTACHMENT'}


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
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


def _normalize_entry_type(value: Optional[str]) -> str:
    token = (value or '').strip().upper()
    if token in VALID_ENTRY_TYPES:
        return token
    # Accept aliases
    if token in {'FILES', 'ATTACHMENTS'}:
        return 'ATTACHMENT'
    if token in {'PRIMARY', 'DIAGRAMS'}:
        return 'DIAGRAM'
    return 'ATTACHMENT'


def init_tab15_file_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_key TEXT NOT NULL,
                owner_key TEXT NOT NULL,
                entry_type TEXT NOT NULL,
                upload_token TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_size INTEGER DEFAULT 0,
                mime_type TEXT,
                is_primary INTEGER NOT NULL DEFAULT 0,
                kind TEXT,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_scope_owner ON {TABLE_NAME}(scope_key, owner_key)"
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_scope_owner_type ON {TABLE_NAME}(scope_key, owner_key, entry_type)"
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_upload_token ON {TABLE_NAME}(upload_token)"
        )
        conn.commit()
        logger.info('%s table ready', TABLE_NAME)


def list_entries(
    *,
    scope_key: str,
    owner_key: str,
    entry_type: Optional[str] = None,
    app=None,
) -> List[Dict[str, Any]]:
    if not scope_key or not owner_key:
        return []
    clauses = ['scope_key = ?', 'owner_key = ?']
    params: List[Any] = [scope_key, owner_key]
    if entry_type:
        clauses.append('entry_type = ?')
        params.append(_normalize_entry_type(entry_type))
    where_sql = ' AND '.join(clauses)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"""
            SELECT id, scope_key, owner_key, entry_type, upload_token, file_name, file_size, mime_type,
                   is_primary, kind, description, created_at
            FROM {TABLE_NAME}
            WHERE {where_sql}
            ORDER BY is_primary DESC, id DESC
            """,
            params,
        ).fetchall()
    return [
        {
            'id': r['id'],
            'scope_key': r['scope_key'],
            'owner_key': r['owner_key'],
            'entry_type': r['entry_type'],
            'upload_token': r['upload_token'],
            'file_name': r['file_name'],
            'file_size': r['file_size'] or 0,
            'mime_type': r['mime_type'] or '',
            'is_primary': bool(r['is_primary']),
            'kind': r['kind'] or '',
            'description': r['description'] or '',
            'created_at': r['created_at'],
        }
        for r in rows
    ]


def create_entry(
    *,
    scope_key: str,
    owner_key: str,
    entry_type: str,
    upload_token: str,
    file_name: str,
    file_size: int,
    mime_type: str,
    is_primary: bool = False,
    kind: str = '',
    description: str = '',
    replace_primary: bool = False,
    app=None,
) -> Dict[str, Any]:
    if not scope_key:
        raise ValueError('scope_key is required')
    if not owner_key:
        raise ValueError('owner_key is required')
    if not upload_token:
        raise ValueError('upload_token is required')
    et = _normalize_entry_type(entry_type)
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

    with _get_connection(app) as conn:
        if et == 'DIAGRAM' and (replace_primary or is_primary):
            # Keep only one diagram per (scope_key, owner_key)
            conn.execute(
                f"DELETE FROM {TABLE_NAME} WHERE scope_key = ? AND owner_key = ? AND entry_type = 'DIAGRAM'",
                (scope_key, owner_key),
            )
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (scope_key, owner_key, entry_type, upload_token, file_name, file_size, mime_type, is_primary, kind, description, created_at)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scope_key,
                owner_key,
                et,
                upload_token,
                file_name,
                int(file_size or 0),
                mime_type or '',
                1 if (is_primary or et == 'DIAGRAM') else 0,
                kind or '',
                description or '',
                now,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid() AS id').fetchone()['id']
        conn.commit()

    return {
        'id': int(new_id),
        'scope_key': scope_key,
        'owner_key': owner_key,
        'entry_type': et,
        'upload_token': upload_token,
        'file_name': file_name,
        'file_size': int(file_size or 0),
        'mime_type': mime_type or '',
        'is_primary': bool(is_primary or et == 'DIAGRAM'),
        'kind': kind or '',
        'description': description or '',
        'created_at': now,
    }


def delete_entry(entry_id: int, *, app=None) -> Optional[Dict[str, Any]]:
    if not entry_id:
        return None
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, scope_key, owner_key, entry_type, upload_token, file_name, file_size, mime_type, is_primary, kind, description, created_at FROM {TABLE_NAME} WHERE id = ?",
            (int(entry_id),),
        ).fetchone()
        if not row:
            return None
        conn.execute(f"DELETE FROM {TABLE_NAME} WHERE id = ?", (int(entry_id),))
        conn.commit()
    return {
        'id': row['id'],
        'scope_key': row['scope_key'],
        'owner_key': row['owner_key'],
        'entry_type': row['entry_type'],
        'upload_token': row['upload_token'],
        'file_name': row['file_name'],
        'file_size': row['file_size'] or 0,
        'mime_type': row['mime_type'] or '',
        'is_primary': bool(row['is_primary']),
        'kind': row['kind'] or '',
        'description': row['description'] or '',
        'created_at': row['created_at'],
    }
