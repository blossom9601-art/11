import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'upload_meta'


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        # Fallback to instance db for non-sqlite URIs
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


def init_upload_meta_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_size INTEGER DEFAULT 0,
                mime_type TEXT,
                disk_name TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_created_at ON {TABLE_NAME}(created_at)"
        )
        conn.commit()
        logger.info('%s table ready', TABLE_NAME)


def save_upload_meta(
    fid: str,
    *,
    file_name: str,
    file_size: int,
    mime_type: str,
    disk_name: str,
    app=None,
) -> Dict[str, Any]:
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT OR REPLACE INTO {TABLE_NAME}
                (id, file_name, file_size, mime_type, disk_name, created_at)
            VALUES
                (?, ?, ?, ?, ?, ?)
            """,
            (fid, file_name, int(file_size or 0), mime_type or '', disk_name, now),
        )
        conn.commit()
    return {
        'id': fid,
        'name': file_name,
        'size': int(file_size or 0),
        'mime_type': mime_type or '',
        'disk_name': disk_name,
        'created_at': now,
    }


def get_upload_meta(fid: str, *, app=None) -> Optional[Dict[str, Any]]:
    if not fid:
        return None
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, file_name, file_size, mime_type, disk_name, created_at FROM {TABLE_NAME} WHERE id = ?",
            (fid,),
        ).fetchone()
    if not row:
        return None
    return {
        'id': row['id'],
        'name': row['file_name'],
        'size': row['file_size'] or 0,
        'mime_type': row['mime_type'] or '',
        'disk_name': row['disk_name'],
        'created_at': row['created_at'],
    }


def list_upload_metas(*, limit: int = 5000, app=None) -> List[Dict[str, Any]]:
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT id, file_name, file_size, mime_type, disk_name, created_at FROM {TABLE_NAME} ORDER BY created_at DESC LIMIT ?",
            (int(limit or 5000),),
        ).fetchall()
    return [
        {
            'id': r['id'],
            'name': r['file_name'],
            'size': r['file_size'] or 0,
            'mime_type': r['mime_type'] or '',
            'disk_name': r['disk_name'],
            'created_at': r['created_at'],
        }
        for r in rows
    ]


def delete_upload_meta(fid: str, *, app=None) -> bool:
    if not fid:
        return False
    with _get_connection(app) as conn:
        cur = conn.execute(f"DELETE FROM {TABLE_NAME} WHERE id = ?", (fid,))
        conn.commit()
    return (cur.rowcount or 0) > 0
