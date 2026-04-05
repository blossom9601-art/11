import logging
import os
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'biz_work_group_file'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('WORK_GROUP_FILE_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'work_group_file.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'work_group_file.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    if os.path.isabs(path):
        return path
    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(_project_root(app), relative))


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
        pass
    return conn


def init_work_group_file_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    stored_name TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    content_type TEXT,
                    size_bytes INTEGER,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_group_kind ON {TABLE_NAME}(group_id, kind)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'group_id': row['group_id'],
        'kind': row['kind'],
        'stored_name': row['stored_name'],
        'original_name': row['original_name'],
        'content_type': row['content_type'],
        'size_bytes': row['size_bytes'],
        'created_at': row['created_at'],
        'created_by': row['created_by'],
    }


def list_work_group_files(group_id: int, *, kind: Optional[str] = None, app=None) -> List[Dict[str, Any]]:
    app = app or current_app
    kind_norm = (kind or '').strip().lower() if kind else None
    with _get_connection(app) as conn:
        init_work_group_file_table(app)
        params: List[Any] = [group_id]
        where = 'group_id = ? AND is_deleted = 0'
        if kind_norm:
            where += ' AND kind = ?'
            params.append(kind_norm)
        rows = conn.execute(
            f"SELECT id, group_id, kind, stored_name, original_name, content_type, size_bytes, created_at, created_by FROM {TABLE_NAME} WHERE {where} ORDER BY id ASC",
            params,
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_work_group_file(file_id: int, group_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        init_work_group_file_table(app)
        row = conn.execute(
            f"SELECT id, group_id, kind, stored_name, original_name, content_type, size_bytes, created_at, created_by FROM {TABLE_NAME} WHERE id = ? AND group_id = ? AND is_deleted = 0",
            (file_id, group_id),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_work_group_file(
    group_id: int,
    *,
    kind: str,
    stored_name: str,
    original_name: str,
    content_type: Optional[str],
    size_bytes: Optional[int],
    actor: str,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    kind_norm = (kind or '').strip().lower() or 'attachment'
    actor = (actor or 'system').strip() or 'system'
    created_at = _now()

    with _get_connection(app) as conn:
        init_work_group_file_table(app)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (group_id, kind, stored_name, original_name, content_type, size_bytes, created_at, created_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (group_id, kind_norm, stored_name, original_name, content_type, size_bytes, created_at, actor),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    rec = get_work_group_file(new_id, group_id, app)
    return rec or {
        'id': new_id,
        'group_id': group_id,
        'kind': kind_norm,
        'stored_name': stored_name,
        'original_name': original_name,
        'content_type': content_type,
        'size_bytes': size_bytes,
        'created_at': created_at,
        'created_by': actor,
    }


def delete_work_group_file(file_id: int, group_id: int, app=None) -> bool:
    app = app or current_app
    with _get_connection(app) as conn:
        init_work_group_file_table(app)
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1 WHERE id = ? AND group_id = ? AND is_deleted = 0",
            (file_id, group_id),
        )
        conn.commit()
        return cur.rowcount > 0


def purge_kind(group_id: int, kind: str, app=None) -> List[Dict[str, Any]]:
    """Mark all files of kind deleted and return previous rows (for disk cleanup)."""
    app = app or current_app
    kind_norm = (kind or '').strip().lower()
    if not kind_norm:
        return []
    with _get_connection(app) as conn:
        init_work_group_file_table(app)
        rows = conn.execute(
            f"SELECT id, group_id, kind, stored_name, original_name, content_type, size_bytes, created_at, created_by FROM {TABLE_NAME} WHERE group_id = ? AND kind = ? AND is_deleted = 0",
            (group_id, kind_norm),
        ).fetchall()
        conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1 WHERE group_id = ? AND kind = ? AND is_deleted = 0",
            (group_id, kind_norm),
        )
        conn.commit()
        return [_row_to_dict(r) for r in rows]


def new_stored_filename(original_name: str) -> str:
    """Helper to generate stored filenames consistently."""
    base = os.path.basename((original_name or '').replace('\\', '/'))
    return f"{uuid.uuid4().hex}_{base}" if base else uuid.uuid4().hex
