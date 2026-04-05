import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'hw_activate'

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000


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


def init_hw_activate_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_key TEXT NOT NULL,
                asset_id INTEGER NOT NULL,
                svc_type TEXT,
                svc_name TEXT,
                account TEXT,
                start_proc TEXT,
                stop_proc TEXT,
                check_method TEXT,
                owner TEXT,
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


def _sanitize_text(value: Any, *, max_len: int = 5000) -> str:
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
        'svc_type': row['svc_type'] or '',
        'svc_name': row['svc_name'] or '',
        'account': row['account'] or '',
        'start': row['start_proc'] or '',
        'stop': row['stop_proc'] or '',
        'check': row['check_method'] or '',
        'owner': row['owner'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def list_hw_activates(
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


def create_hw_activate(payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    scope_key = _sanitize_text(payload.get('scope_key'), max_len=120)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')
    asset_id = _sanitize_int(payload.get('asset_id'))

    data = {
        'svc_type': _sanitize_text(payload.get('svc_type'), max_len=120),
        'svc_name': _sanitize_text(payload.get('svc_name'), max_len=200),
        'account': _sanitize_text(payload.get('account'), max_len=200),
        'start_proc': _sanitize_text(payload.get('start'), max_len=5000),
        'stop_proc': _sanitize_text(payload.get('stop'), max_len=5000),
        'check_method': _sanitize_text(payload.get('check'), max_len=5000),
        'owner': _sanitize_text(payload.get('owner'), max_len=200),
    }

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                scope_key, asset_id,
                svc_type, svc_name, account, start_proc, stop_proc, check_method, owner,
                created_at, created_by
            ) VALUES (
                ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?
            )
            """,
            (
                scope_key,
                asset_id,
                data['svc_type'],
                data['svc_name'],
                data['account'],
                data['start_proc'],
                data['stop_proc'],
                data['check_method'],
                data['owner'],
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


def update_hw_activate(activate_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    activate_id = _sanitize_int(activate_id)

    data = {
        'svc_type': _sanitize_text(payload.get('svc_type'), max_len=120),
        'svc_name': _sanitize_text(payload.get('svc_name'), max_len=200),
        'account': _sanitize_text(payload.get('account'), max_len=200),
        'start_proc': _sanitize_text(payload.get('start'), max_len=5000),
        'stop_proc': _sanitize_text(payload.get('stop'), max_len=5000),
        'check_method': _sanitize_text(payload.get('check'), max_len=5000),
        'owner': _sanitize_text(payload.get('owner'), max_len=200),
    }

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (activate_id,),
        ).fetchone()
        if not existing:
            raise ValueError('기동절차 항목을 찾을 수 없습니다.')

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET svc_type = ?, svc_name = ?, account = ?, start_proc = ?, stop_proc = ?,
                check_method = ?, owner = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (
                data['svc_type'],
                data['svc_name'],
                data['account'],
                data['start_proc'],
                data['stop_proc'],
                data['check_method'],
                data['owner'],
                _now(),
                (actor or 'system').strip() or 'system',
                activate_id,
            ),
        )
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (activate_id,),
        ).fetchone()
        conn.commit()
        return _row_to_dict(row)


def get_hw_activate(activate_id: int, *, app=None):
    """단건 조회 — 변경이력(diff) 기록용."""
    activate_id = _sanitize_int(activate_id)
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (activate_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def delete_hw_activate(activate_id: int, *, app=None) -> None:
    activate_id = _sanitize_int(activate_id)
    with _get_connection(app) as conn:
        conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id = ?",
            (activate_id,),
        )
        conn.commit()
