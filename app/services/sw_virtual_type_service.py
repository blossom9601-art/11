import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'sw_virtual_type'
MANUFACTURER_TABLE = 'biz_vendor_manufacturer'

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    virtual_code TEXT NOT NULL UNIQUE,
    virtual_name TEXT NOT NULL,
    manufacturer_code TEXT NOT NULL,
    virtual_family TEXT NOT NULL,
    release_date TEXT,
    eosl_date TEXT,
    virtual_count INTEGER DEFAULT 0,
    remark TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (manufacturer_code)
        REFERENCES {MANUFACTURER_TABLE}(manufacturer_code)
)
"""


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('SW_VIRTUAL_TYPE_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'sw_virtual_type.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'sw_virtual_type.db')
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
        logger.warning('Could not enable FK enforcement for %s', TABLE_NAME)
    return conn


def _sanitize_int(value: Any) -> int:
    if value in (None, ''):
        return 0
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else 0
    except (TypeError, ValueError):
        return 0


def _normalize_code(seed: str) -> str:
    base = (seed or 'VT').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base).strip('_') or 'VT'
    return base[:60]


def _generate_unique_code(conn: sqlite3.Connection, seed: str) -> str:
    base = _normalize_code(seed)
    candidate = base
    counter = 1
    while True:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE virtual_code = ?",
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
            raise ValueError('고유 가상화 코드를 생성하지 못했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE virtual_code = ?",
        (code,),
    ).fetchone()
    if row and (record_id is None or row['id'] != record_id):
        raise ValueError('이미 사용 중인 가상화 코드입니다.')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    qty = row['virtual_count'] or 0
    remark = row['remark'] or ''
    name = row['virtual_name']
    virtual_family = row['virtual_family']
    manufacturer_name = row['manufacturer_name'] if 'manufacturer_name' in row.keys() else None
    return {
        'id': row['id'],
        'virtual_code': row['virtual_code'],
        'virtual_name': name,
        'model': name,
        'manufacturer_code': row['manufacturer_code'],
        'manufacturer_name': manufacturer_name or '',
        'vendor': manufacturer_name or '',
        'vendor_code': row['manufacturer_code'],
        'virtual_family': virtual_family,
        'hw_type': virtual_family,
        'release_date': row['release_date'] or '',
        'eosl_date': row['eosl_date'] or '',
        'eosl': row['eosl_date'] or '',
        'virtual_count': qty,
        'qty': qty,
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
        'virtual_code': ['virtual_code', 'code', 'vt_code'],
        'virtual_name': ['virtual_name', 'model', 'name'],
        'manufacturer_code': ['manufacturer_code', 'vendor_code'],
        'manufacturer_name': ['manufacturer_name', 'vendor', 'manufacturer'],
        'virtual_family': ['virtual_family', 'family', 'hw_type', 'type', 'category'],
        'release_date': ['release_date'],
        'eosl_date': ['eosl_date', 'eosl'],
        'virtual_count': ['virtual_count', 'qty', 'count'],
        'remark': ['remark', 'note', 'description'],
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data[alias]
                break
    if require_all:
        missing = [key for key in ('virtual_name', 'virtual_family') if not payload.get(key)]
        if missing:
            raise ValueError('필수 필드가 누락되었습니다: ' + ', '.join(missing))
        if not payload.get('manufacturer_code') and not payload.get('manufacturer_name'):
            raise ValueError('제조사 정보를 입력하세요.')
    if 'virtual_count' in payload:
        payload['virtual_count'] = _sanitize_int(payload['virtual_count'])
    return payload


def _resolve_manufacturer_code(conn: sqlite3.Connection, payload: Dict[str, Any]) -> str:
    candidate = (payload.get('manufacturer_code') or '').strip()
    if candidate:
        row = conn.execute(
            f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_code = ? AND is_deleted = 0",
            (candidate,),
        ).fetchone()
        if not row:
            raise ValueError('등록되지 않은 제조사 코드입니다.')
        return row['manufacturer_code']
    name = (payload.get('manufacturer_name') or '').strip()
    if not name:
        raise ValueError('제조사 정보를 입력하세요.')
    row = conn.execute(
        f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_name = ? AND is_deleted = 0",
        (name,),
    ).fetchone()
    if row:
        return row['manufacturer_code']
    raise ValueError('제조사 정보를 찾을 수 없습니다.')


def init_sw_virtual_type_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(CREATE_TABLE_SQL)
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(virtual_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_manufacturer ON {TABLE_NAME}(manufacturer_code)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def list_sw_virtual_types(app=None, *, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1' if include_deleted else 'v.is_deleted = 0']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'v.virtual_code LIKE ?',
                'v.virtual_name LIKE ?',
                'v.manufacturer_code LIKE ?',
                'v.virtual_family LIKE ?',
                'v.remark LIKE ?'
            ]) + ')')
            params.extend([like] * 5)
        query = (
            f"SELECT v.id, v.virtual_code, v.virtual_name, v.manufacturer_code, v.virtual_family, "
            f"v.release_date, v.eosl_date, v.virtual_count, v.remark, v.created_at, v.created_by, "
            f"v.updated_at, v.updated_by, v.is_deleted, m.manufacturer_name, "
            f"0 AS usage_count "
            f"FROM {TABLE_NAME} v "
            f"LEFT JOIN {MANUFACTURER_TABLE} m ON m.manufacturer_code = v.manufacturer_code "
            f"WHERE {' AND '.join(clauses)} ORDER BY v.id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_sw_virtual_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT v.id, v.virtual_code, v.virtual_name, v.manufacturer_code, v.virtual_family, "
            f"v.release_date, v.eosl_date, v.virtual_count, v.remark, v.created_at, v.created_by, "
            f"v.updated_at, v.updated_by, v.is_deleted, m.manufacturer_name "
            f"FROM {TABLE_NAME} v "
            f"LEFT JOIN {MANUFACTURER_TABLE} m ON m.manufacturer_code = v.manufacturer_code "
            f"WHERE v.id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_sw_virtual_type(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=True)
    name = payload['virtual_name'].strip()
    virtual_family = payload['virtual_family'].strip()
    timestamp = _now()
    with _get_connection(app) as conn:
        manufacturer_code = _resolve_manufacturer_code(conn, payload)
        virtual_code = (payload.get('virtual_code') or '').strip()
        if virtual_code:
            _assert_unique_code(conn, virtual_code)
        else:
            virtual_code = _generate_unique_code(conn, name)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (virtual_code, virtual_name, manufacturer_code, virtual_family, release_date, eosl_date,
                 virtual_count, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                virtual_code[:60],
                name,
                manufacturer_code,
                virtual_family,
                payload.get('release_date'),
                payload.get('eosl_date'),
                payload.get('virtual_count', 0),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return get_sw_virtual_type(new_id, app)


def update_sw_virtual_type(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=False)
    if not payload:
        return get_sw_virtual_type(record_id, app)
    with _get_connection(app) as conn:
        updates: List[str] = []
        params: List[Any] = []
        if 'virtual_code' in payload:
            code = (payload['virtual_code'] or '').strip()
            if code:
                _assert_unique_code(conn, code, record_id)
                updates.append('virtual_code = ?')
                params.append(code[:60])
            else:
                payload.pop('virtual_code', None)
        if 'manufacturer_code' in payload or 'manufacturer_name' in payload:
            payload['manufacturer_code'] = _resolve_manufacturer_code(conn, payload)
        for column in (
            'virtual_name',
            'manufacturer_code',
            'virtual_family',
            'release_date',
            'eosl_date',
            'virtual_count',
            'remark',
        ):
            if column in payload:
                value = payload[column]
                if column in ('virtual_name', 'virtual_family') and not value:
                    raise ValueError('필수 필드를 비울 수 없습니다.')
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            return get_sw_virtual_type(record_id, app)
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
    return get_sw_virtual_type(record_id, app)


def soft_delete_sw_virtual_types(ids: Iterable[Any], actor: str, app=None) -> int:
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
    timestamp = _now()
    with _get_connection(app) as conn:
        params: List[Any] = [timestamp, actor, *safe_ids]
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? "
            f"WHERE id IN ({placeholders}) AND is_deleted = 0",
            params,
        )
        conn.commit()
        return cur.rowcount
