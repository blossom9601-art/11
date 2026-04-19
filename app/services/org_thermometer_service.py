import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'org_thermometer'
_INITIALIZED_DB_PATHS: set[str] = set()

_SCHEMA_SQL = f"""
    CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_code TEXT NOT NULL UNIQUE,
        business_status TEXT NOT NULL,
        business_name TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        serial_number TEXT,
        place_name TEXT NOT NULL,
        system_owner_dept TEXT,
        system_owner_name TEXT,
        service_owner_dept TEXT,
        service_owner_name TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_at TEXT,
        updated_by TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0
    )
"""


def _ensure_modern_columns(conn: sqlite3.Connection) -> None:
    try:
        rows = conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()
    except Exception:
        rows = []
    existing = {row[1] for row in rows if row and len(row) > 1}

    def add_column(name: str, ddl: str) -> None:
        if name not in existing:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {ddl}")

    # Ensure columns used by current code exist (supports legacy DBs).
    add_column('device_code', "device_code TEXT")
    add_column('business_status', "business_status TEXT NOT NULL DEFAULT ''")
    add_column('business_name', "business_name TEXT NOT NULL DEFAULT ''")
    add_column('vendor_name', "vendor_name TEXT NOT NULL DEFAULT ''")
    add_column('model_name', "model_name TEXT NOT NULL DEFAULT ''")
    add_column('serial_number', 'serial_number TEXT')
    add_column('place_name', "place_name TEXT NOT NULL DEFAULT ''")
    add_column('system_owner_dept', 'system_owner_dept TEXT')
    add_column('system_owner_name', 'system_owner_name TEXT')
    add_column('service_owner_dept', 'service_owner_dept TEXT')
    add_column('service_owner_name', 'service_owner_name TEXT')
    add_column('created_at', 'created_at TEXT')
    add_column('created_by', 'created_by TEXT')
    add_column('updated_at', 'updated_at TEXT')
    add_column('updated_by', 'updated_by TEXT')
    add_column('is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0')


def _ensure_table_ready(conn: sqlite3.Connection) -> None:
    conn.execute(_SCHEMA_SQL)
    _ensure_modern_columns(conn)
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)")
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(business_status)")


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('ORG_THERMOMETER_SQLITE_PATH') or app.config.get('ORG_RACK_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'org_thermometer.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'org_thermometer.db')
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
    abs_db_path = os.path.abspath(db_path)
    if abs_db_path not in _INITIALIZED_DB_PATHS:
        _ensure_table_ready(conn)
        conn.commit()
        _INITIALIZED_DB_PATHS.add(abs_db_path)
    return conn


def _resolve_center_column(conn: sqlite3.Connection) -> str:
    try:
        columns = {row[1] for row in conn.execute(f'PRAGMA table_info({TABLE_NAME})').fetchall()}
    except Exception:
        columns = set()
    return 'center_name' if 'center_name' in columns else 'place_name'


def _sanitize_int(value: Any) -> Optional[int]:
    if value in (None, '', 'null'):
        return None
    try:
        parsed = int(str(value).strip())
        return parsed if parsed >= 0 else None
    except (TypeError, ValueError):
        return None


def _require_text(data: Dict[str, Any], key: str, label: str) -> str:
    value = (data.get(key) or '').strip()
    if not value:
        raise ValueError(f'{label} 값은 필수입니다.')
    return value


def _optional_text(data: Dict[str, Any], key: str) -> Optional[str]:
    value = (data.get(key) or '').strip()
    return value or None


def _generate_device_code(conn: sqlite3.Connection, name: str, place: str) -> str:
    seed_left = re.sub(r'[^A-Z0-9]+', '_', (place or '').upper()).strip('_')
    seed_right = re.sub(r'[^A-Z0-9]+', '_', (name or '').upper()).strip('_')
    base = '_'.join(filter(None, [seed_left, seed_right])) or 'THERMO'
    base = base[:48]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(f'SELECT 1 FROM {TABLE_NAME} WHERE device_code = ?', (candidate,)).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:64]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    center_value = None
    if isinstance(row, sqlite3.Row):
        keys = row.keys()
        if 'center_name' in keys:
            center_value = row['center_name']
        elif 'place_name' in keys:
            center_value = row['place_name']
    return {
        'id': row['id'],
        'thermo_code': row['device_code'],
        'business_status': row['business_status'],
        'business_name': row['business_name'],
        'vendor': row['vendor_name'],
        'model': row['model_name'],
        'serial': row['serial_number'] or '',
        'place': row['place_name'],
        'system_owner_dept': row['system_owner_dept'],
        'system_owner': row['system_owner_name'],
        'service_owner_dept': row['service_owner_dept'],
        'service_owner': row['service_owner_name'],
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
        'center_name': center_value,
    }


def init_org_thermometer_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            _ensure_table_ready(conn)
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize org_thermometer table')
        raise


def list_org_thermometers(
    app=None,
    search: Optional[str] = None,
    include_deleted: bool = False,
    center_name: Optional[str] = None,
    business_name: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        center_column = _resolve_center_column(conn)
        clauses = ['1=1']
        params: List[Any] = []
        if not include_deleted:
            clauses.append('is_deleted = 0')
        if search:
            like = f"%{search}%"
            search_columns = [
                'device_code',
                'business_status',
                'business_name',
                'vendor_name',
                'model_name',
                'serial_number',
                'place_name',
                'system_owner_dept',
                'system_owner_name',
                'service_owner_dept',
                'service_owner_name',
            ]
            if center_column not in search_columns:
                search_columns.append(center_column)
            clauses.append('(' + ' OR '.join([f"{col} LIKE ?" for col in search_columns]) + ')')
            params.extend([like] * len(search_columns))
        if center_name:
            clauses.append(f'{center_column} LIKE ?')
            params.append(f"{center_name}%")
        if business_name:
            clauses.append('business_name LIKE ?')
            params.append(f"%{business_name}%")
        select_fields = (
            "id, device_code, business_status, business_name, vendor_name, model_name, serial_number, place_name, "
            "system_owner_dept, system_owner_name, service_owner_dept, service_owner_name, created_at, created_by, updated_at, updated_by, is_deleted, "
            f"{center_column} AS center_name"
        )
        limit_clause = ''
        limit_value: Optional[int] = None
        if limit is not None:
            try:
                parsed = int(limit)
                if parsed > 0:
                    limit_value = parsed
                    limit_clause = ' LIMIT ?'
            except (TypeError, ValueError):
                limit_value = None
        query = (
            f"SELECT {select_fields} FROM {TABLE_NAME} "
            f"WHERE {' AND '.join(clauses)} ORDER BY id DESC{limit_clause}"
        )
        exec_params = list(params)
        if limit_value is not None:
            exec_params.append(limit_value)
        rows = conn.execute(query, exec_params).fetchall()
        return [_row_to_dict(row) for row in rows]


def _fetch_single(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, device_code, business_status, business_name, vendor_name, model_name, serial_number, place_name, "
            f"system_owner_dept, system_owner_name, service_owner_dept, service_owner_name, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_org_thermometer(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    business_status = _require_text(data, 'business_status', '업무 상태')
    business_name = _require_text(data, 'business_name', '업무 이름')
    vendor_name = _require_text(data, 'vendor', '시스템 제조사')
    model_name = _require_text(data, 'model', '시스템 모델명')
    place_name = _require_text(data, 'place', '시스템 장소')
    serial_number = _optional_text(data, 'serial')
    # 담당부서/담당자는 선택값 (UI에서 미입력 가능)
    # 기존 DB 스키마가 NOT NULL인 경우를 대비해 빈 문자열로 저장한다.
    system_owner_dept = _optional_text(data, 'system_owner_dept') or ''
    system_owner_name = _optional_text(data, 'system_owner') or ''
    service_owner_dept = _optional_text(data, 'service_owner_dept') or ''
    service_owner_name = _optional_text(data, 'service_owner') or ''
    with _get_connection(app) as conn:
        device_code = (data.get('thermo_code') or data.get('device_code') or '').strip()
        if not device_code:
            device_code = _generate_device_code(conn, business_name, place_name)
        timestamp = _now()
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                device_code, business_status, business_name, vendor_name, model_name, serial_number,
                place_name, system_owner_dept, system_owner_name, service_owner_dept, service_owner_name,
                created_at, created_by, updated_at, updated_by, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                device_code,
                business_status,
                business_name,
                vendor_name,
                model_name,
                serial_number,
                place_name,
                system_owner_dept,
                system_owner_name,
                service_owner_dept,
                service_owner_name,
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return _fetch_single(new_id, app)


def update_org_thermometer(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    updates: List[str] = []
    params: List[Any] = []
    required_text_fields = {
        'business_status': '업무 상태',
        'business_name': '업무 이름',
        'vendor': '시스템 제조사',
        'model': '시스템 모델명',
        'place': '시스템 장소',
    }
    optional_text_keys = {
        'system_owner_dept',
        'system_owner',
        'service_owner_dept',
        'service_owner',
    }
    column_map = {
        'business_status': 'business_status',
        'business_name': 'business_name',
        'vendor': 'vendor_name',
        'model': 'model_name',
        'serial': 'serial_number',
        'place': 'place_name',
        'system_owner_dept': 'system_owner_dept',
        'system_owner': 'system_owner_name',
        'service_owner_dept': 'service_owner_dept',
        'service_owner': 'service_owner_name',
        'thermo_code': 'device_code',
        'device_code': 'device_code',
    }
    for key, column in column_map.items():
        if key in data:
            if key == 'serial':
                value = _optional_text(data, key)
            elif key in optional_text_keys:
                # Allow clearing 담당부서/담당자 (store as empty string for legacy NOT NULL schema)
                value = _optional_text(data, key) or ''
            elif key in required_text_fields:
                value = _require_text(data, key, required_text_fields[key])
            else:
                value = (data.get(key) or '').strip()
                if not value:
                    raise ValueError(f'{key} 값은 비워둘 수 없습니다.')
            updates.append(f'{column} = ?')
            params.append(value)
    if not updates:
        return _fetch_single(record_id, app)
    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, record_id])
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return _fetch_single(record_id, app)


def bulk_update_org_thermometers(
    ids: Sequence[Any],
    updates_data: Dict[str, Any],
    actor: str,
    app=None,
) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'

    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    if not isinstance(updates_data, dict) or not updates_data:
        raise ValueError('변경할 값을 1개 이상 입력하세요.')

    required_text_fields = {
        'business_status': '업무 상태',
        'business_name': '업무 이름',
        'vendor': '시스템 제조사',
        'model': '시스템 모델명',
        'place': '시스템 장소',
    }
    optional_text_keys = {
        'system_owner_dept',
        'system_owner',
        'service_owner_dept',
        'service_owner',
    }
    column_map = {
        'business_status': 'business_status',
        'business_name': 'business_name',
        'vendor': 'vendor_name',
        'model': 'model_name',
        'serial': 'serial_number',
        'place': 'place_name',
        'system_owner_dept': 'system_owner_dept',
        'system_owner': 'system_owner_name',
        'service_owner_dept': 'service_owner_dept',
        'service_owner': 'service_owner_name',
    }

    updates: List[str] = []
    params: List[Any] = []

    for key, column in column_map.items():
        if key not in updates_data:
            continue
        if key == 'serial':
            raw = (updates_data.get(key) or '').strip()
            value = raw or None
        elif key in optional_text_keys:
            value = ((updates_data.get(key) or '').strip()) or ''
        elif key in required_text_fields:
            value = ((updates_data.get(key) or '').strip())
            if not value:
                raise ValueError(f"{required_text_fields[key]} 값은 필수입니다.")
        else:
            value = ((updates_data.get(key) or '').strip())
            if not value:
                raise ValueError(f'{key} 값은 비워둘 수 없습니다.')

        updates.append(f'{column} = ?')
        params.append(value)

    if not updates:
        raise ValueError('변경할 값을 1개 이상 입력하세요.')

    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor])

    placeholders = ','.join('?' for _ in safe_ids)
    params.extend(safe_ids)
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id IN ({placeholders}) AND is_deleted = 0",
            params,
        )
        conn.commit()
        return cur.rowcount


def soft_delete_org_thermometers(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
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
