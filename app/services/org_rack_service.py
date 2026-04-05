import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'org_rack'


def _list_columns(conn: sqlite3.Connection) -> Dict[str, sqlite3.Row]:
    rows = conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()
    return {row[1]: row for row in rows}


def _ensure_modern_columns(conn: sqlite3.Connection) -> None:
    columns = _list_columns(conn)

    def add_column(name: str, ddl: str) -> None:
        if name not in columns:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {ddl}")

    add_column('business_status_code', "TEXT NOT NULL DEFAULT ''")
    add_column('business_name', "TEXT NOT NULL DEFAULT ''")
    add_column('manufacturer_code', "TEXT NOT NULL DEFAULT ''")
    add_column('system_model_code', "TEXT NOT NULL DEFAULT ''")
    add_column('serial_number', "TEXT NOT NULL DEFAULT ''")
    add_column('rack_position', "TEXT NOT NULL DEFAULT ''")
    add_column('system_height_u', 'INTEGER NOT NULL DEFAULT 0')
    add_column('system_dept_code', "TEXT NOT NULL DEFAULT ''")
    add_column('system_manager_id', 'INTEGER NOT NULL DEFAULT 0')
    add_column('service_dept_code', "TEXT NOT NULL DEFAULT ''")
    add_column('service_manager_id', 'INTEGER NOT NULL DEFAULT 0')
    add_column('remark', 'TEXT')
    conn.commit()

    columns = _list_columns(conn)
    if 'rack_name' in columns:
        conn.execute(
            f"UPDATE {TABLE_NAME} SET business_name = rack_name WHERE business_name IS NULL OR business_name = ''"
        )
        conn.execute(
            f"UPDATE {TABLE_NAME} SET rack_position = rack_name WHERE rack_position IS NULL OR rack_position = ''"
        )
    if 'note' in columns and 'remark' in columns:
        conn.execute(
            f"UPDATE {TABLE_NAME} SET remark = note WHERE (remark IS NULL OR remark = '') AND note IS NOT NULL"
        )
    conn.commit()


def _ensure_indexes(conn: sqlite3.Connection) -> None:
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_is_deleted ON {TABLE_NAME}(is_deleted)"
    )
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_center ON {TABLE_NAME}(center_code)"
    )
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(business_status_code)"
    )
    conn.commit()


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('ORG_RACK_SQLITE_PATH') or app.config.get('ORG_CENTER_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'org_rack.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'org_rack.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    # On Windows, urlparse('sqlite:///dev_blossom.db').path becomes '/dev_blossom.db'.
    # Treat that as an instance-local filename, not an absolute path (C:\\dev_blossom.db).
    # Also handle absolute Windows paths that appear as '/C:/...'.
    if os.name == 'nt' and path.startswith('/') and not path.startswith('//'):
        if re.match(r'^/[A-Za-z]:', path):
            path = path[1:]
    if os.path.isabs(path):
        return os.path.abspath(path)

    # Keep relative SQLite filenames aligned with Flask-SQLAlchemy, which
    # resolves "sqlite:///filename.db" under instance_path.
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


def _sanitize_int(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def _sanitize_float(value: Any) -> Optional[float]:
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _generate_unique_code(conn: sqlite3.Connection, name: str) -> str:
    seed = (name or 'RACK').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', seed).strip('_') or 'RACK'
    base = base[:40]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE rack_code = ?",
            (candidate,)
        ).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:60]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    system_height_u = row['system_height_u'] or 0
    system_mgr_id = row['system_manager_id'] or None
    service_mgr_id = row['service_manager_id'] or None
    rack_position = row['rack_position'] or ''
    business_name = row['business_name'] or ''
    rack_display_name = rack_position or business_name or row['rack_code']
    return {
        'id': row['id'],
        'rack_code': row['rack_code'],
        'business_status_code': row['business_status_code'] or '',
        'business_name': business_name,
        'manufacturer_code': row['manufacturer_code'] or '',
        'rack_model': row['system_model_code'] or '',
        'system_model_code': row['system_model_code'] or '',
        'serial_number': row['serial_number'] or '',
        'center_code': row['center_code'] or '',
        'rack_position': rack_position,
        'rack_name': rack_display_name,
        'system_height_u': system_height_u,
        'system_height': f"{system_height_u}U" if system_height_u else '',
        'system_dept_code': row['system_dept_code'] or '',
        'system_owner_dept_code': row['system_dept_code'] or '',
        'system_manager_id': system_mgr_id,
        'system_owner_id': str(system_mgr_id) if system_mgr_id else '',
        'service_dept_code': row['service_dept_code'] or '',
        'service_owner_dept_code': row['service_dept_code'] or '',
        'service_manager_id': service_mgr_id,
        'service_owner_id': str(service_mgr_id) if service_mgr_id else '',
        'remark': row['remark'] or '',
        'note': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def init_org_rack_table(app=None) -> None:
    app = app or current_app
    schema_sql = f"""
        CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rack_code TEXT NOT NULL UNIQUE,
            business_status_code TEXT NOT NULL,
            business_name TEXT NOT NULL,
            manufacturer_code TEXT NOT NULL,
            system_model_code TEXT NOT NULL,
            serial_number TEXT NOT NULL,
            center_code TEXT NOT NULL,
            rack_position TEXT NOT NULL,
            system_height_u INTEGER NOT NULL DEFAULT 0,
            system_dept_code TEXT NOT NULL,
            system_manager_id INTEGER NOT NULL,
            service_dept_code TEXT NOT NULL,
            service_manager_id INTEGER NOT NULL,
            remark TEXT,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT,
            updated_by TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0
        )
    """
    try:
        with _get_connection(app) as conn:
            conn.execute(schema_sql)
            conn.commit()
            _ensure_modern_columns(conn)
            _ensure_indexes(conn)
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize org_rack table')
        raise


def list_org_racks(app=None, search: Optional[str] = None, include_deleted: bool = False, center_code: Optional[str] = None) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1']
        params: List[Any] = []
        if not include_deleted:
            clauses.append('is_deleted = 0')
        if center_code:
            clauses.append('center_code = ?')
            params.append(center_code.strip())
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'rack_code LIKE ?',
                'rack_position LIKE ?',
                'business_name LIKE ?',
                'serial_number LIKE ?',
                'manufacturer_code LIKE ?',
                'system_model_code LIKE ?'
            ]) + ')')
            params.extend([like] * 6)
        query = (
            f"SELECT id, rack_code, business_status_code, business_name, manufacturer_code, system_model_code, serial_number, center_code, rack_position, system_height_u, system_dept_code, system_manager_id, service_dept_code, service_manager_id, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def _fetch_single(rack_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, rack_code, business_status_code, business_name, manufacturer_code, system_model_code, serial_number, center_code, rack_position, system_height_u, system_dept_code, system_manager_id, service_dept_code, service_manager_id, remark, created_at, created_by, updated_at, updated_by, is_deleted FROM {TABLE_NAME} WHERE id = ?",
            (rack_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def fetch_by_rack_code(rack_code: str, app=None) -> Optional[Dict[str, Any]]:
    """rack_code 로 단건 조회 (is_deleted=0)."""
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, rack_code, business_status_code, business_name, manufacturer_code, system_model_code, serial_number, center_code, rack_position, system_height_u, system_dept_code, system_manager_id, service_dept_code, service_manager_id, remark, created_at, created_by, updated_at, updated_by, is_deleted FROM {TABLE_NAME} WHERE rack_code = ? AND is_deleted = 0",
            (rack_code,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_org_rack(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    business_status = (data.get('business_status_code') or '').strip()
    if not business_status:
        raise ValueError('business_status_code is required')
    business_name = (data.get('business_name') or '').strip()
    if not business_name:
        raise ValueError('business_name is required')
    # Optional fields (UI requires only 4 fields).
    # Table columns are NOT NULL with defaults, so store empty string / 0 instead of NULL.
    manufacturer_code = (data.get('manufacturer_code') or '').strip()
    rack_model = (data.get('rack_model') or data.get('system_model_code') or '').strip()
    serial_number = (data.get('serial_number') or '').strip()
    center_code = (data.get('center_code') or '').strip()
    if not center_code:
        raise ValueError('center_code is required')
    rack_position = (data.get('rack_position') or '').strip()
    if not rack_position:
        raise ValueError('rack_position is required')
    system_height_u = _sanitize_int(data.get('system_height_u'))
    if system_height_u is None:
        system_height_u = 0
    system_dept_code = (data.get('system_dept_code') or data.get('system_owner_dept_code') or '').strip()
    service_dept_code = (data.get('service_dept_code') or data.get('service_owner_dept_code') or '').strip()
    system_manager_id = _sanitize_int(data.get('system_manager_id') or data.get('system_owner_id') or data.get('system_owner'))
    if system_manager_id is None:
        system_manager_id = 0
    service_manager_id = _sanitize_int(data.get('service_manager_id') or data.get('service_owner_id') or data.get('service_owner'))
    if service_manager_id is None:
        service_manager_id = 0
    remark = (data.get('remark') or data.get('note') or '').strip() or None
    with _get_connection(app) as conn:
        rack_code = (data.get('rack_code') or '').strip() or _generate_unique_code(conn, rack_position or business_name)
        timestamp = _now()
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (rack_code, business_status_code, business_name, manufacturer_code, system_model_code, serial_number, center_code, rack_position, system_height_u, system_dept_code, system_manager_id, service_dept_code, service_manager_id, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                rack_code,
                business_status,
                business_name,
                manufacturer_code,
                rack_model,
                serial_number,
                center_code,
                rack_position,
                system_height_u,
                system_dept_code,
                system_manager_id,
                service_dept_code,
                service_manager_id,
                remark,
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return _fetch_single(new_id, app)


def update_org_rack(rack_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    updates: List[str] = []
    params: List[Any] = []
    field_map = {
        'rack_code': 'rack_code',
        'business_status_code': 'business_status_code',
        'business_name': 'business_name',
        'manufacturer_code': 'manufacturer_code',
        'rack_model': 'system_model_code',
        'system_model_code': 'system_model_code',
        'serial_number': 'serial_number',
        'center_code': 'center_code',
        'rack_position': 'rack_position',
        'system_dept_code': 'system_dept_code',
        'system_owner_dept_code': 'system_dept_code',
        'service_dept_code': 'service_dept_code',
        'service_owner_dept_code': 'service_dept_code',
        'remark': 'remark',
        'note': 'remark',
    }
    required_text_keys = {'business_status_code', 'business_name', 'center_code', 'rack_position'}
    for payload_key, column in field_map.items():
        if payload_key in data:
            value = (data.get(payload_key) or '').strip()
            if payload_key in required_text_keys and not value:
                raise ValueError(f'{payload_key} cannot be empty')
            updates.append(f'{column} = ?')
            if column == 'remark':
                params.append(value or None)
            else:
                # Keep NOT NULL text columns consistent: store '' instead of NULL.
                params.append(value)
    if 'system_height_u' in data:
        height = _sanitize_int(data.get('system_height_u'))
        if height is None:
            height = 0
        updates.append('system_height_u = ?')
        params.append(height)
    if 'system_manager_id' in data or 'system_owner_id' in data or 'system_owner' in data:
        owner_val = _sanitize_int(data.get('system_manager_id') or data.get('system_owner_id') or data.get('system_owner'))
        if owner_val is None:
            owner_val = 0
        updates.append('system_manager_id = ?')
        params.append(owner_val)
    if 'service_manager_id' in data or 'service_owner_id' in data or 'service_owner' in data:
        svc_val = _sanitize_int(data.get('service_manager_id') or data.get('service_owner_id') or data.get('service_owner'))
        if svc_val is None:
            svc_val = 0
        updates.append('service_manager_id = ?')
        params.append(svc_val)
    if not updates:
        return _fetch_single(rack_id, app)
    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, rack_id])
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return _fetch_single(rack_id, app)


def soft_delete_org_racks(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    timestamp = _now()
    with _get_connection(app) as conn:
        params: List[Any] = [timestamp, actor, *safe_ids]
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders}) AND is_deleted = 0",
            params,
        )
        conn.commit()
        return cur.rowcount


def hard_delete_org_racks(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            safe_ids,
        )
        conn.commit()
        return cur.rowcount
