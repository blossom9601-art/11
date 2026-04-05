from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'sw_system_allocation'

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    """Resolve the SQLite file used by SQLAlchemy (usually dev_blossom.db).

    Many other services write directly to the same SQLite file via sqlite3.
    """

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

    # On Windows, urlparse('sqlite:///dev_blossom.db').path becomes '/dev_blossom.db'.
    # Treat that as a relative filename (instance-local).
    if os.name == 'nt' and path.startswith('/') and not path.startswith('//'):
        if len(path) >= 4 and path[1].isalpha() and path[2] == ':' and path[3] == '/':
            path = path[1:]

    path = path.lstrip('/')
    if os.path.isabs(path):
        return os.path.abspath(path)

    # Match Flask-SQLAlchemy behavior: instance_path relative
    instance_candidate = os.path.abspath(os.path.join(app.instance_path, path))
    project_candidate = os.path.abspath(os.path.join(_project_root(app), path))
    if os.path.exists(instance_candidate):
        return instance_candidate
    if os.path.exists(project_candidate):
        return project_candidate
    return instance_candidate


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


def init_sw_system_allocation_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_key TEXT NOT NULL,
                work_status TEXT,
                work_group TEXT,
                work_name TEXT,
                system_name TEXT,
                system_ip TEXT,
                software_detail_version TEXT,
                license_quantity INTEGER,
                remark TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_scope_key ON {TABLE_NAME}(scope_key)"
        )
        conn.commit()


def _sanitize_text(value: Any, *, max_len: int = 2000) -> str:
    s = ('' if value is None else str(value)).strip()
    if s == '-':
        s = ''
    if max_len and len(s) > max_len:
        s = s[:max_len]
    return s


def _sanitize_int_optional(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    raw = str(value).strip()
    if raw == '' or raw == '-':
        return None
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError('정수 값이 올바르지 않습니다.') from exc


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'scope_key': row['scope_key'],
        'work_status': row['work_status'] or '',
        'work_group': row['work_group'] or '',
        'work_name': row['work_name'] or '',
        'system_name': row['system_name'] or '',
        'system_ip': row['system_ip'] or '',
        'software_detail_version': row['software_detail_version'] or '',
        'license_quantity': row['license_quantity'],
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def list_sw_system_allocations(
    scope_key: str,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Dict[str, Any]:
    scope_key = _sanitize_text(scope_key, max_len=200)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    with _get_connection() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS c FROM {TABLE_NAME} WHERE scope_key = ?",
            (scope_key,),
        ).fetchone()['c']
        rows = conn.execute(
            f"""
            SELECT *
            FROM {TABLE_NAME}
            WHERE scope_key = ?
            ORDER BY id ASC
            LIMIT ? OFFSET ?
            """,
            (scope_key, page_size, offset),
        ).fetchall()

    return {
        'items': [_row_to_dict(r) for r in rows],
        'page': page,
        'page_size': page_size,
        'total': int(total or 0),
    }


def create_sw_system_allocation(payload: Dict[str, Any], *, actor: str = 'system') -> Dict[str, Any]:
    payload = payload or {}
    scope_key = _sanitize_text(payload.get('scope_key'), max_len=200)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')

    work_status = _sanitize_text(payload.get('work_status'), max_len=50)
    work_group = _sanitize_text(payload.get('work_group'), max_len=200)
    work_name = _sanitize_text(payload.get('work_name'), max_len=500)
    system_name = _sanitize_text(payload.get('system_name'), max_len=200)
    system_ip = _sanitize_text(payload.get('system_ip'), max_len=200)
    software_detail_version = _sanitize_text(payload.get('software_detail_version'), max_len=500)
    license_quantity = _sanitize_int_optional(payload.get('license_quantity'))
    remark = _sanitize_text(payload.get('remark'), max_len=2000)

    actor = _sanitize_text(actor, max_len=100) or 'system'
    now = _now()

    with _get_connection() as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                scope_key,
                work_status,
                work_group,
                work_name,
                system_name,
                system_ip,
                software_detail_version,
                license_quantity,
                remark,
                created_at,
                created_by,
                updated_at,
                updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scope_key,
                work_status,
                work_group,
                work_name,
                system_name,
                system_ip,
                software_detail_version,
                license_quantity,
                remark,
                now,
                actor,
                now,
                actor,
            ),
        )
        row_id = int(cur.lastrowid)
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (row_id,),
        ).fetchone()
        conn.commit()

    return _row_to_dict(row)


def update_sw_system_allocation(
    allocation_id: int,
    payload: Dict[str, Any],
    *,
    actor: str = 'system',
) -> Dict[str, Any]:
    payload = payload or {}
    try:
        allocation_id = int(allocation_id)
    except (TypeError, ValueError) as exc:
        raise ValueError('allocation_id가 올바르지 않습니다.') from exc

    scope_key = _sanitize_text(payload.get('scope_key'), max_len=200)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')

    fields = {
        'work_status': _sanitize_text(payload.get('work_status'), max_len=50),
        'work_group': _sanitize_text(payload.get('work_group'), max_len=200),
        'work_name': _sanitize_text(payload.get('work_name'), max_len=500),
        'system_name': _sanitize_text(payload.get('system_name'), max_len=200),
        'system_ip': _sanitize_text(payload.get('system_ip'), max_len=200),
        'software_detail_version': _sanitize_text(payload.get('software_detail_version'), max_len=500),
        'license_quantity': _sanitize_int_optional(payload.get('license_quantity')),
        'remark': _sanitize_text(payload.get('remark'), max_len=2000),
    }

    actor = _sanitize_text(actor, max_len=100) or 'system'
    now = _now()

    with _get_connection() as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND scope_key = ?",
            (allocation_id, scope_key),
        ).fetchone()
        if not existing:
            raise ValueError('대상 행을 찾을 수 없습니다.')

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET work_status = ?,
                work_group = ?,
                work_name = ?,
                system_name = ?,
                system_ip = ?,
                software_detail_version = ?,
                license_quantity = ?,
                remark = ?,
                updated_at = ?,
                updated_by = ?
            WHERE id = ? AND scope_key = ?
            """,
            (
                fields['work_status'],
                fields['work_group'],
                fields['work_name'],
                fields['system_name'],
                fields['system_ip'],
                fields['software_detail_version'],
                fields['license_quantity'],
                fields['remark'],
                now,
                actor,
                allocation_id,
                scope_key,
            ),
        )
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (allocation_id,),
        ).fetchone()
        conn.commit()

    return _row_to_dict(row)


def delete_sw_system_allocation(allocation_id: int, *, scope_key: str) -> None:
    try:
        allocation_id = int(allocation_id)
    except (TypeError, ValueError) as exc:
        raise ValueError('allocation_id가 올바르지 않습니다.') from exc

    scope_key = _sanitize_text(scope_key, max_len=200)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')

    with _get_connection() as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id = ? AND scope_key = ?",
            (allocation_id, scope_key),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError('삭제 대상 행을 찾을 수 없습니다.')


def bulk_delete_sw_system_allocations(scope_key: str, ids: List[int]) -> Dict[str, Any]:
    scope_key = _sanitize_text(scope_key, max_len=200)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')

    clean_ids: List[int] = []
    for v in ids or []:
        try:
            clean_ids.append(int(v))
        except (TypeError, ValueError):
            continue

    if not clean_ids:
        return {'ok': True, 'deleted': 0}

    placeholders = ','.join(['?'] * len(clean_ids))
    with _get_connection() as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE scope_key = ? AND id IN ({placeholders})",
            [scope_key] + clean_ids,
        )
        conn.commit()
        return {'ok': True, 'deleted': int(cur.rowcount or 0)}
