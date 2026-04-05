import os
import sqlite3
from datetime import datetime
from typing import Any, Dict
from urllib.parse import urlparse

from flask import current_app

TABLE_NAME = 'tab14_change_log'

DEFAULT_PAGE_SIZE = 200
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
    # Flask-SQLAlchemy resolves relative sqlite paths under the instance folder.
    # Keep tab14 logs in the same DB file as the rest of the app.
    return os.path.abspath(os.path.join(app.instance_path, path))


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


def init_tab14_change_log_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_key TEXT NOT NULL,
                when_text TEXT,
                change_type TEXT,
                change_owner TEXT,
                change_tab TEXT,
                summary TEXT,
                detail TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_entity ON {TABLE_NAME}(entity_key)"
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
        'entity_key': row['entity_key'],
        'when': row['when_text'] or '',
        'type': row['change_type'] or '',
        'owner': row['change_owner'] or '',
        'tab': row['change_tab'] or '',
        'summary': row['summary'] or '',
        'detail': row['detail'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'] or '',
        'updated_by': row['updated_by'] or '',
    }


def list_change_logs(
    entity_key: str,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    app=None,
) -> Dict[str, Any]:
    entity_key = _sanitize_text(entity_key, max_len=600)
    if not entity_key:
        raise ValueError('entity_key가 필요합니다.')

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    with _get_connection(app) as conn:
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE entity_key = ?",
            (entity_key,),
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_NAME}
            WHERE entity_key = ?
            ORDER BY id ASC
            LIMIT ? OFFSET ?
            """,
            (entity_key, page_size, offset),
        ).fetchall()
        return {
            'items': [_row_to_dict(r) for r in rows],
            'page': page,
            'page_size': page_size,
            'total': int(total or 0),
        }


def create_change_log(payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    entity_key = _sanitize_text(payload.get('entity_key'), max_len=600)
    if not entity_key:
        raise ValueError('entity_key가 필요합니다.')

    when_text = _sanitize_text(payload.get('when'), max_len=32)
    change_type = _sanitize_text(payload.get('type'), max_len=20)
    change_owner = _sanitize_text(payload.get('owner'), max_len=80)
    change_tab = _sanitize_text(payload.get('tab'), max_len=40)

    summary = _sanitize_text(payload.get('summary'), max_len=500)
    detail = _sanitize_text(payload.get('detail'), max_len=5000)

    if not when_text:
        raise ValueError('변경일시(when)가 필요합니다.')
    if not change_type:
        raise ValueError('변경유형(type)이 필요합니다.')
    if not change_owner:
        raise ValueError('변경자(owner)가 필요합니다.')
    if not change_tab:
        raise ValueError('변경탭(tab)이 필요합니다.')
    if not (summary or detail):
        raise ValueError('변경 내용(summary/detail)이 필요합니다.')

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                entity_key,
                when_text,
                change_type,
                change_owner,
                change_tab,
                summary,
                detail,
                created_at,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entity_key,
                when_text,
                change_type,
                change_owner,
                change_tab,
                summary,
                detail,
                _now(),
                (actor or 'system').strip() or 'system',
            ),
        )
        new_id = int(cur.lastrowid)
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (new_id,)).fetchone()
        conn.commit()
        return _row_to_dict(row)


def update_change_log(log_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    log_id_int = _sanitize_int(log_id)

    when_text = _sanitize_text(payload.get('when'), max_len=32)
    change_type = _sanitize_text(payload.get('type'), max_len=20)
    change_owner = _sanitize_text(payload.get('owner'), max_len=80)
    change_tab = _sanitize_text(payload.get('tab'), max_len=40)

    summary = _sanitize_text(payload.get('summary'), max_len=500)
    detail = _sanitize_text(payload.get('detail'), max_len=5000)

    if not when_text:
        raise ValueError('변경일시(when)가 필요합니다.')
    if not change_type:
        raise ValueError('변경유형(type)이 필요합니다.')
    if not change_owner:
        raise ValueError('변경자(owner)가 필요합니다.')
    if not change_tab:
        raise ValueError('변경탭(tab)이 필요합니다.')
    if not (summary or detail):
        raise ValueError('변경 내용(summary/detail)이 필요합니다.')

    with _get_connection(app) as conn:
        existing = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (log_id_int,)).fetchone()
        if not existing:
            raise ValueError('변경이력 항목을 찾을 수 없습니다.')

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET when_text = ?, change_type = ?, change_owner = ?, change_tab = ?,
                summary = ?, detail = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (
                when_text,
                change_type,
                change_owner,
                change_tab,
                summary,
                detail,
                _now(),
                (actor or 'system').strip() or 'system',
                log_id_int,
            ),
        )
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (log_id_int,)).fetchone()
        conn.commit()
        return _row_to_dict(row)


def delete_change_log(log_id: int, *, app=None) -> None:
    log_id_int = _sanitize_int(log_id)
    with _get_connection(app) as conn:
        conn.execute(f"DELETE FROM {TABLE_NAME} WHERE id = ?", (log_id_int,))
        conn.commit()
