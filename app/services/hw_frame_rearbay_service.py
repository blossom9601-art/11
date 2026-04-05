import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'hw_frame_rearbay'

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 5000


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


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


def init_hw_frame_rearbay_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_key TEXT NOT NULL,
                asset_id INTEGER NOT NULL,
                hw_type TEXT,
                space TEXT,
                model TEXT,
                spec TEXT,
                serial TEXT,
                vendor TEXT,
                fw TEXT,
                remark TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_scope_asset ON {TABLE_NAME}(scope_key, asset_id)"
        )
        conn.commit()


def _sanitize_text(value: Any, *, max_len: int = 500) -> str:
    s = ('' if value is None else str(value)).strip()
    if s == '-':
        s = ''
    if max_len and len(s) > max_len:
        s = s[:max_len]
    return s


def _sanitize_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('정수 값이 올바르지 않습니다.') from exc


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'scope_key': row['scope_key'],
        'asset_id': row['asset_id'],
        'type': row['hw_type'] or '',
        'space': row['space'] or '',
        'model': row['model'] or '',
        'spec': row['spec'] or '',
        'serial': row['serial'] or '',
        'vendor': row['vendor'] or '',
        'fw': row['fw'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def list_hw_frame_rearbay_items(
    scope_key: str,
    asset_id: int,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    app=None,
) -> Dict[str, Any]:
    scope_key = _sanitize_text(scope_key, max_len=120)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')
    asset_id = _sanitize_int(asset_id)

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    with _get_connection(app) as conn:
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE scope_key = ? AND asset_id = ?",
            (scope_key, asset_id),
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_NAME}
            WHERE scope_key = ? AND asset_id = ?
            ORDER BY id ASC
            LIMIT ? OFFSET ?
            """,
            (scope_key, asset_id, page_size, offset),
        ).fetchall()
        return {
            'items': [_row_to_dict(r) for r in rows],
            'page': page,
            'page_size': page_size,
            'total': int(total or 0),
        }


def create_hw_frame_rearbay_item(payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    scope_key = _sanitize_text(payload.get('scope_key'), max_len=120)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')
    asset_id = _sanitize_int(payload.get('asset_id'))

    data = {
        'hw_type': _sanitize_text(payload.get('type'), max_len=120),
        'space': _sanitize_text(payload.get('space'), max_len=120),
        'model': _sanitize_text(payload.get('model'), max_len=200),
        'spec': _sanitize_text(payload.get('spec'), max_len=500),
        'serial': _sanitize_text(payload.get('serial'), max_len=200),
        'vendor': _sanitize_text(payload.get('vendor'), max_len=200),
        'fw': _sanitize_text(payload.get('fw'), max_len=200),
        'remark': _sanitize_text(payload.get('remark'), max_len=500),
    }

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                scope_key, asset_id,
                hw_type, space, model, spec, serial, vendor, fw, remark,
                created_at, created_by
            ) VALUES (
                ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?
            )
            """,
            (
                scope_key,
                asset_id,
                data['hw_type'],
                data['space'],
                data['model'],
                data['spec'],
                data['serial'],
                data['vendor'],
                data['fw'],
                data['remark'],
                _now(),
                (actor or 'system').strip() or 'system',
            ),
        )
        new_id = int(cur.lastrowid)
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (new_id,),
        ).fetchone()
        conn.commit()
        return _row_to_dict(row)


def update_hw_frame_rearbay_item(item_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    item_id = _sanitize_int(item_id)

    data = {
        'hw_type': _sanitize_text(payload.get('type'), max_len=120),
        'space': _sanitize_text(payload.get('space'), max_len=120),
        'model': _sanitize_text(payload.get('model'), max_len=200),
        'spec': _sanitize_text(payload.get('spec'), max_len=500),
        'serial': _sanitize_text(payload.get('serial'), max_len=200),
        'vendor': _sanitize_text(payload.get('vendor'), max_len=200),
        'fw': _sanitize_text(payload.get('fw'), max_len=200),
        'remark': _sanitize_text(payload.get('remark'), max_len=500),
    }

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not existing:
            raise ValueError('대상 항목을 찾을 수 없습니다.')

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET
                hw_type = ?,
                space = ?,
                model = ?,
                spec = ?,
                serial = ?,
                vendor = ?,
                fw = ?,
                remark = ?,
                updated_at = ?,
                updated_by = ?
            WHERE id = ?
            """,
            (
                data['hw_type'],
                data['space'],
                data['model'],
                data['spec'],
                data['serial'],
                data['vendor'],
                data['fw'],
                data['remark'],
                _now(),
                (actor or 'system').strip() or 'system',
                item_id,
            ),
        )
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (item_id,),
        ).fetchone()
        conn.commit()
        return _row_to_dict(row)


def delete_hw_frame_rearbay_item(item_id: int, *, app=None) -> None:
    item_id = _sanitize_int(item_id)
    with _get_connection(app) as conn:
        conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id = ?",
            (item_id,),
        )
        conn.commit()
