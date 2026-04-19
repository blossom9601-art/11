import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'biz_customer_client'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('CUSTOMER_CLIENT_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'customer_client.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'customer_client.db')
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
        logger.warning('Could not enable foreign key enforcement for customer client table')
    return conn


def _sanitize_int(value: Any) -> int:
    if value in (None, ''):
        return 0
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return parsed if parsed >= 0 else 0


def _normalize_code(seed: str) -> str:
    base = (seed or 'CLIENT').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base).strip('_') or 'CLIENT'
    return base[:60]


def _generate_unique_code(conn: sqlite3.Connection, seed: str) -> str:
    base = _normalize_code(seed)
    candidate = base
    counter = 1
    while True:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE customer_code = ?",
            (candidate,),
        ).fetchone()
        if not row:
            return candidate
        counter += 1
        suffix = f"_{counter}"
        candidate = (
            base[:60 - len(suffix)] + suffix
            if len(base) + len(suffix) > 60
            else base + suffix
        )
        if counter > 9999:
            raise ValueError('고객사 코드 생성에 실패했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE customer_code = ?",
        (code,),
    ).fetchone()
    if row and (record_id is None or row['id'] != record_id):
        raise ValueError('이미 사용 중인 고객사 코드입니다.')


def init_customer_client_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_code TEXT NOT NULL UNIQUE,
                    customer_name TEXT NOT NULL,
                    address TEXT,
                    manager_count INTEGER DEFAULT 0,
                    line_count INTEGER DEFAULT 0,
                    remark TEXT,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    updated_at TEXT,
                    updated_by TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(customer_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    line_count = row['line_count'] or 0
    manager_count = row['manager_count'] or 0
    remark = row['remark'] or ''
    name = row['customer_name']
    return {
        'id': row['id'],
        'customer_code': row['customer_code'],
        'customer_name': name,
        'member_name': name,
        'associate_name': name,
        'address': row['address'] or '',
        'manager_count': manager_count,
        'line_count': line_count,
        'line_qty': line_count,
        'remark': remark,
        'note': remark,
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def _prepare_payload(data: Dict[str, Any], *, require_all: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    mapping = {
        'customer_name': ['customer_name', 'member_name'],
        'customer_code': ['customer_code', 'member_code'],
        'address': ['address'],
        'manager_count': ['manager_count'],
        'line_count': ['line_count', 'line_qty'],
        'remark': ['remark', 'note']
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data[alias]
                break
    if require_all and not payload.get('customer_name'):
        raise ValueError('customer_name is required')
    if 'manager_count' in payload:
        payload['manager_count'] = _sanitize_int(payload['manager_count'])
    if 'line_count' in payload:
        payload['line_count'] = _sanitize_int(payload['line_count'])
    return payload


def list_customer_clients(app=None, *, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1' if include_deleted else 'is_deleted = 0']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'customer_name LIKE ?',
                'customer_code LIKE ?',
                'address LIKE ?'
            ]) + ')')
            params.extend([like, like, like])
        query = (
            f"SELECT id, customer_code, customer_name, address, manager_count, line_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_customer_client(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, customer_code, customer_name, address, manager_count, line_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_customer_client(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=True)
    name = payload['customer_name'].strip()
    if not name:
        raise ValueError('customer_name is required')
    timestamp = _now()
    with _get_connection(app) as conn:
        code = payload.get('customer_code')
        if code:
            _assert_unique_code(conn, code)
        else:
            code = _generate_unique_code(conn, name)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (customer_code, customer_name, address, manager_count, line_count, remark,
                 created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                code[:60],
                name,
                payload.get('address'),
                payload.get('manager_count', 0),
                payload.get('line_count', 0),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return get_customer_client(new_id, app)


def update_customer_client(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=False)
    if not payload:
        return get_customer_client(record_id, app)
    with _get_connection(app) as conn:
        if 'customer_code' in payload:
            code = payload['customer_code']
            if code:
                _assert_unique_code(conn, code, record_id)
            else:
                del payload['customer_code']
        updates: List[str] = []
        params: List[Any] = []
        for column in ('customer_name', 'customer_code', 'address', 'manager_count', 'line_count', 'remark'):
            if column in payload:
                value = payload[column]
                if column == 'customer_name' and not value:
                    raise ValueError('customer_name is required')
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            return get_customer_client(record_id, app)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, record_id])
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return get_customer_client(record_id, app)


def soft_delete_customer_clients(ids: Iterable[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids: List[int] = []
    for raw in ids:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value >= 0:
            safe_ids.append(value)
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            [now, actor] + safe_ids,
        )
        conn.commit()
        return cur.rowcount
