import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'org_company'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('ORG_COMPANY_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'org_company.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'org_company.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    if path.startswith('/') and not path.startswith('//'):
        path = path.lstrip('/')
    if os.path.isabs(path):
        return os.path.abspath(path)
    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(app.instance_path, relative))


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


def _generate_unique_code(conn: sqlite3.Connection, name: str) -> str:
    seed = (name or 'COMPANY').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', seed).strip('_') or 'COMPANY'
    base = base[:40]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE company_code = ?",
            (candidate,),
        ).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:60]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    keys = set(row.keys())
    user_count = row['user_count'] if 'user_count' in keys else 0
    return {
        'id': row['id'],
        'company_code': row['company_code'],
        'company_name': row['company_name'],
        'description': row['description'] or '',
        'note': row['note'] or '',
        'user_count': user_count or 0,
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def init_org_company_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    company_code TEXT NOT NULL UNIQUE,
                    company_name TEXT NOT NULL,
                    description TEXT,
                    note TEXT,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    updated_at TEXT,
                    updated_by TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_is_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_name ON {TABLE_NAME}(company_name)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize org_company table')
        raise


def _fetch_user_company_counts(conn: sqlite3.Connection) -> Dict[str, int]:
    result: Dict[str, int] = {}
    try:
        rows = conn.execute(
            "SELECT company, COUNT(*) AS cnt FROM users WHERE company IS NOT NULL AND TRIM(company) != '' GROUP BY company"
        ).fetchall()
        for row in rows:
            key = (row['company'] or '').strip()
            if key:
                result[key] = int(row['cnt'] or 0)
    except Exception:
        logger.debug('Failed to count users per company', exc_info=True)
    return result


def list_org_companies(app=None, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        sql = [f"SELECT * FROM {TABLE_NAME} WHERE 1=1"]
        params: List[Any] = []
        if not include_deleted:
            sql.append("AND is_deleted = 0")
        if search:
            like = f"%{search.strip()}%"
            sql.append("AND (company_name LIKE ? OR description LIKE ? OR note LIKE ? OR company_code LIKE ?)")
            params.extend([like, like, like, like])
        sql.append("ORDER BY company_name COLLATE NOCASE ASC, id ASC")
        rows = conn.execute(" ".join(sql), params).fetchall()
        user_counts = _fetch_user_company_counts(conn)
        items = []
        for row in rows:
            item = _row_to_dict(row)
            item['user_count'] = user_counts.get(item['company_name'], 0)
            items.append(item)
        return items


def create_org_company(payload: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    company_name = (payload.get('company_name') or '').strip()
    if not company_name:
        raise ValueError('회사명을 입력하세요.')
    description = (payload.get('description') or '').strip() or None
    note = (payload.get('note') or '').strip() or None
    timestamp = _now()
    actor_name = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        dup = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE company_name = ? AND is_deleted = 0 LIMIT 1",
            (company_name,),
        ).fetchone()
        if dup:
            raise ValueError('동일한 회사명이 이미 존재합니다.')
        company_code = _generate_unique_code(conn, company_name)
        cursor = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (company_code, company_name, description, note, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (company_code, company_name, description, note, timestamp, actor_name, timestamp, actor_name),
        )
        conn.commit()
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (cursor.lastrowid,)).fetchone()
        item = _row_to_dict(row)
        item['user_count'] = 0
        return item


def update_org_company(company_id: int, payload: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    company_name = (payload.get('company_name') or '').strip()
    if not company_name:
        raise ValueError('회사명을 입력하세요.')
    description = (payload.get('description') or '').strip() or None
    note = (payload.get('note') or '').strip() or None
    timestamp = _now()
    actor_name = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? LIMIT 1",
            (company_id,),
        ).fetchone()
        if not existing:
            return None
        dup = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE company_name = ? AND id != ? AND is_deleted = 0 LIMIT 1",
            (company_name, company_id),
        ).fetchone()
        if dup:
            raise ValueError('동일한 회사명이 이미 존재합니다.')
        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET company_name = ?, description = ?, note = ?, updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (company_name, description, note, timestamp, actor_name, company_id),
        )
        conn.commit()
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (company_id,)).fetchone()
        item = _row_to_dict(row)
        item['user_count'] = _fetch_user_company_counts(conn).get(item['company_name'], 0)
        return item


def soft_delete_org_companies(ids: Sequence[int], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    valid_ids = [int(v) for v in ids if str(v).strip()]
    if not valid_ids:
        return 0
    placeholders = ','.join('?' for _ in valid_ids)
    now = _now()
    with _get_connection(app) as conn:
        cursor = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            [now, actor] + valid_ids,
        )
        conn.commit()
        return int(cursor.rowcount or 0)