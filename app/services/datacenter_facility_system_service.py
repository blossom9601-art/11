import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

from app.services.public_id_service import make_public_id

logger = logging.getLogger(__name__)

TABLE_NAME = 'datacenter_facility_system'

RESOURCE_CONFIGS = {
    'transformer': {
        'label': '변압기',
        'code_prefix': 'DCTRANS',
        'public_prefix': 'dctrans',
    },
    'generator': {
        'label': '발전기',
        'code_prefix': 'DCGEN',
        'public_prefix': 'dcgen',
    },
    'ups': {
        'label': '무정전전원장치',
        'code_prefix': 'UPS',
        'public_prefix': 'dcups',
    },
    'battery': {
        'label': '배터리',
        'code_prefix': 'DCBAT',
        'public_prefix': 'dcbat',
    },
    'hvac': {
        'label': '항온항습기',
        'code_prefix': 'HVAC',
        'public_prefix': 'dchvac',
    },
    'leak_detector': {
        'label': '누수감지',
        'code_prefix': 'DCLEAK',
        'public_prefix': 'dcleak',
    },
    'detection': {
        'label': '감지설비',
        'code_prefix': 'DCDET',
        'public_prefix': 'dcdet',
    },
    'fire_extinguishing': {
        'label': '소화설비',
        'code_prefix': 'DCFIRE',
        'public_prefix': 'dcfire',
    },
    'evacuation': {
        'label': '대피설비',
        'code_prefix': 'DCEVAC',
        'public_prefix': 'dcevac',
    },
}

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_type TEXT NOT NULL,
    system_code TEXT NOT NULL UNIQUE,
    layout_key TEXT NOT NULL DEFAULT '',
    left_pct REAL,
    top_pct REAL,
    width_pct REAL,
    height_pct REAL,
    box_identifier TEXT,
    color_hex TEXT,
    business_status TEXT NOT NULL DEFAULT '',
    business_name TEXT NOT NULL DEFAULT '',
    manufacturer_name TEXT NOT NULL DEFAULT '',
    model_name TEXT NOT NULL DEFAULT '',
    serial_number TEXT,
    place_name TEXT NOT NULL DEFAULT '',
    system_owner_dept TEXT,
    system_owner_name TEXT,
    service_owner_dept TEXT,
    service_owner_name TEXT,
    remark TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
)
"""

LAYOUT_COLUMNS = {
    'layout_key': "TEXT NOT NULL DEFAULT ''",
    'left_pct': 'REAL',
    'top_pct': 'REAL',
    'width_pct': 'REAL',
    'height_pct': 'REAL',
    'box_identifier': 'TEXT',
    'color_hex': 'TEXT',
}


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    override = app.config.get('DATACENTER_FACILITY_SYSTEM_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'datacenter_facility_system.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'datacenter_facility_system.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    if path.startswith('/') and not path.startswith('//'):
        path = path.lstrip('/')
    if os.path.isabs(path):
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, path.lstrip('/')))


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


def _resource_key(resource_type: str) -> str:
    key = (resource_type or '').strip().lower().replace('-', '_')
    if key not in RESOURCE_CONFIGS:
        raise ValueError('지원하지 않는 데이터센터 시설 구분입니다.')
    return key


def _normalize_code(seed: str, prefix: str) -> str:
    base = re.sub(r'[^A-Z0-9]+', '_', (seed or prefix).upper()).strip('_') or prefix
    if not base.startswith(prefix):
        base = f'{prefix}_{base}'
    return base[:80]


def _generate_unique_code(conn: sqlite3.Connection, seed: str, prefix: str) -> str:
    base = _normalize_code(seed, prefix)
    candidate = base
    counter = 1
    while True:
        if not conn.execute(f"SELECT 1 FROM {TABLE_NAME} WHERE system_code = ?", (candidate,)).fetchone():
            return candidate
        counter += 1
        suffix = f"_{counter}"
        candidate = base[:80 - len(suffix)] + suffix if len(base) + len(suffix) > 80 else base + suffix
        if counter > 9999:
            raise ValueError('시스템 코드를 생성하지 못했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(f"SELECT id FROM {TABLE_NAME} WHERE system_code = ?", (code,)).fetchone()
    if row and (record_id is None or int(row['id']) != int(record_id)):
        raise ValueError('이미 사용 중인 시스템 코드입니다.')


def _text(data: Dict[str, Any], *keys: str) -> str:
    for key in keys:
        if key in data and data.get(key) not in (None, ''):
            return str(data.get(key) or '').strip()
    return ''


def _number(data: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        if key not in data:
            continue
        value = data.get(key)
        if value in (None, ''):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            raise ValueError('배치 좌표 값이 올바르지 않습니다.')
    return None


def _row_value(row: sqlite3.Row, key: str, default: Any = '') -> Any:
    return row[key] if key in row.keys() else default


def _require_text(data: Dict[str, Any], label: str, *keys: str) -> str:
    value = _text(data, *keys)
    if not value:
        raise ValueError(f'{label} 값은 필수입니다.')
    return value


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    cfg = RESOURCE_CONFIGS.get(row['resource_type'], RESOURCE_CONFIGS['ups'])
    public_id = make_public_id(TABLE_NAME, cfg['public_prefix'], row['id'])
    return {
        'id': row['id'],
        'public_id': public_id,
        'resource_type': row['resource_type'],
        'resource_label': cfg['label'],
        'system_code': row['system_code'],
        'device_code': row['system_code'],
        'layout_key': _row_value(row, 'layout_key', '') or '',
        'left_pct': _row_value(row, 'left_pct', None),
        'top_pct': _row_value(row, 'top_pct', None),
        'width_pct': _row_value(row, 'width_pct', None),
        'height_pct': _row_value(row, 'height_pct', None),
        'x_pct': _row_value(row, 'left_pct', None),
        'y_pct': _row_value(row, 'top_pct', None),
        'box_identifier': _row_value(row, 'box_identifier', '') or '',
        'color_hex': _row_value(row, 'color_hex', '') or '',
        'business_status': row['business_status'] or '',
        'business_name': row['business_name'] or '',
        'manufacturer_name': row['manufacturer_name'] or '',
        'vendor': row['manufacturer_name'] or '',
        'model_name': row['model_name'] or '',
        'model': row['model_name'] or '',
        'serial_number': row['serial_number'] or '',
        'serial': row['serial_number'] or '',
        'place_name': row['place_name'] or '',
        'place': row['place_name'] or '',
        'system_owner_dept': row['system_owner_dept'] or '',
        'system_owner': row['system_owner_name'] or '',
        'service_owner_dept': row['service_owner_dept'] or '',
        'service_owner': row['service_owner_name'] or '',
        'remark': row['remark'] or '',
        'note': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def _ensure_layout_columns(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
    for column, ddl in LAYOUT_COLUMNS.items():
        if column not in columns:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {column} {ddl}")


def init_datacenter_facility_system_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(CREATE_TABLE_SQL)
            _ensure_layout_columns(conn)
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_resource ON {TABLE_NAME}(resource_type)")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_layout ON {TABLE_NAME}(resource_type, layout_key)")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_model ON {TABLE_NAME}(model_name)")
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def list_datacenter_facility_systems(
    resource_type: str,
    app=None,
    *,
    search: Optional[str] = None,
    layout_key: Optional[str] = None,
    include_deleted: bool = False,
) -> List[Dict[str, Any]]:
    app = app or current_app
    key = _resource_key(resource_type)
    with _get_connection(app) as conn:
        clauses = ['resource_type = ?']
        params: List[Any] = [key]
        if not include_deleted:
            clauses.append('is_deleted = 0')
        if layout_key is not None:
            clauses.append('layout_key = ?')
            params.append(str(layout_key or '').strip())
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'system_code LIKE ?',
                'business_status LIKE ?',
                'business_name LIKE ?',
                'manufacturer_name LIKE ?',
                'model_name LIKE ?',
                'serial_number LIKE ?',
                'place_name LIKE ?',
                'system_owner_dept LIKE ?',
                'system_owner_name LIKE ?',
                'service_owner_dept LIKE ?',
                'service_owner_name LIKE ?',
                'remark LIKE ?',
            ]) + ')')
            params.extend([like] * 12)
        rows = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC",
            params,
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_datacenter_facility_system(record_id: int, app=None, *, resource_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        if resource_type:
            key = _resource_key(resource_type)
            row = conn.execute(
                f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND resource_type = ?",
                (record_id, key),
            ).fetchone()
        else:
            row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (record_id,)).fetchone()
        return _row_to_dict(row) if row else None


def _payload(data: Dict[str, Any], *, partial: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    required = {
        'business_status': ('업무 상태', ('business_status', 'business_status_code', 'status')),
        'business_name': ('업무 이름', ('business_name', 'work_name', 'name')),
        'manufacturer_name': ('시스템 제조사', ('manufacturer_name', 'vendor', 'manufacturer')),
        'model_name': ('시스템 모델명', ('model_name', 'model', 'system_model_name')),
        'place_name': ('시스템 장소', ('place_name', 'place', 'system_location')),
    }
    for column, (label, keys) in required.items():
        if partial and not any(key in data for key in keys):
            continue
        payload[column] = _require_text(data, label, *keys)
    optional_map = {
        'system_code': ('system_code', 'device_code', 'code'),
        'layout_key': ('layout_key', 'route_key'),
        'box_identifier': ('box_identifier', 'box_id', 'identifier'),
        'color_hex': ('color_hex', 'box_color', 'color'),
        'serial_number': ('serial_number', 'serial'),
        'system_owner_dept': ('system_owner_dept', 'system_dept', 'system_owner_dept_code'),
        'system_owner_name': ('system_owner', 'system_owner_name'),
        'service_owner_dept': ('service_owner_dept', 'service_dept', 'service_owner_dept_code'),
        'service_owner_name': ('service_owner', 'service_owner_name'),
        'remark': ('remark', 'note'),
    }
    for column, keys in optional_map.items():
        if any(key in data for key in keys):
            payload[column] = _text(data, *keys)
    numeric_map = {
        'left_pct': ('left_pct', 'x_pct'),
        'top_pct': ('top_pct', 'y_pct'),
        'width_pct': ('width_pct', 'w_pct'),
        'height_pct': ('height_pct', 'h_pct'),
    }
    for column, keys in numeric_map.items():
        if any(key in data for key in keys):
            payload[column] = _number(data, *keys)
    return payload


def create_datacenter_facility_system(resource_type: str, data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    key = _resource_key(resource_type)
    cfg = RESOURCE_CONFIGS[key]
    actor = (actor or 'system').strip() or 'system'
    payload = _payload(data)
    with _get_connection(app) as conn:
        system_code = (payload.get('system_code') or '').strip()
        if system_code:
            system_code = _normalize_code(system_code, cfg['code_prefix'])
            _assert_unique_code(conn, system_code)
        else:
            system_code = _generate_unique_code(conn, payload['business_name'] or payload['model_name'], cfg['code_prefix'])
        timestamp = _now()
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (resource_type, system_code, layout_key, left_pct, top_pct, width_pct, height_pct,
                 box_identifier, color_hex, business_status, business_name, manufacturer_name,
                 model_name, serial_number, place_name, system_owner_dept, system_owner_name,
                 service_owner_dept, service_owner_name, remark, created_at, created_by,
                 updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                key,
                system_code,
                payload.get('layout_key', ''),
                payload.get('left_pct'),
                payload.get('top_pct'),
                payload.get('width_pct'),
                payload.get('height_pct'),
                payload.get('box_identifier'),
                payload.get('color_hex'),
                payload['business_status'],
                payload['business_name'],
                payload['manufacturer_name'],
                payload['model_name'],
                payload.get('serial_number'),
                payload['place_name'],
                payload.get('system_owner_dept'),
                payload.get('system_owner_name'),
                payload.get('service_owner_dept'),
                payload.get('service_owner_name'),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        conn.commit()
        new_id = int(cur.lastrowid)
    return get_datacenter_facility_system(new_id, app, resource_type=key)


def update_datacenter_facility_system(resource_type: str, record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    key = _resource_key(resource_type)
    cfg = RESOURCE_CONFIGS[key]
    actor = (actor or 'system').strip() or 'system'
    payload = _payload(data, partial=True)
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND resource_type = ? AND is_deleted = 0",
            (record_id, key),
        ).fetchone()
        if not existing:
            return None
        updates: List[str] = []
        params: List[Any] = []
        if 'system_code' in payload:
            code = payload.get('system_code') or existing['system_code']
            code = _normalize_code(code, cfg['code_prefix'])
            _assert_unique_code(conn, code, record_id)
            updates.append('system_code = ?')
            params.append(code)
        for column in (
            'layout_key',
            'left_pct',
            'top_pct',
            'width_pct',
            'height_pct',
            'box_identifier',
            'color_hex',
            'business_status',
            'business_name',
            'manufacturer_name',
            'model_name',
            'serial_number',
            'place_name',
            'system_owner_dept',
            'system_owner_name',
            'service_owner_dept',
            'service_owner_name',
            'remark',
        ):
            if column in payload:
                updates.append(f'{column} = ?')
                params.append(payload[column])
        if not updates:
            return get_datacenter_facility_system(record_id, app, resource_type=key)
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([_now(), actor, record_id, key])
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND resource_type = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return get_datacenter_facility_system(record_id, app, resource_type=key)


def soft_delete_datacenter_facility_systems(resource_type: str, ids: Iterable[Any], actor: str, app=None) -> int:
    app = app or current_app
    key = _resource_key(resource_type)
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
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE resource_type = ? AND id IN ({placeholders})",
            [_now(), actor, key] + safe_ids,
        )
        conn.commit()
        return int(cur.rowcount or 0)