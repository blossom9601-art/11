import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

LAB_CONFIG = {
    'lab1': {
        'table': 'system_lab1_thermometer',
        'center': '퓨처센터(5층)'
    },
    'lab2': {
        'table': 'system_lab2_thermometer',
        'center': '퓨처센터(6층)'
    },
    'lab3': {
        'table': 'system_lab3_thermometer',
        'center': '을지트윈타워(15층)'
    },
    'lab4': {
        'table': 'system_lab4_thermometer',
        'center': '재해복구센터(4층)'
    },
}


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    direct = app.config.get('SYSTEM_LAB_THERMO_SQLITE_PATH')
    if direct:
        return os.path.abspath(direct)
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
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
    return conn


def _lab_meta(key: str) -> Dict[str, str]:
    if key not in LAB_CONFIG:
        raise ValueError(f'Unknown lab key: {key}')
    return LAB_CONFIG[key]


def _ensure_table(key: str, app=None) -> None:
    meta = _lab_meta(key)
    table = meta['table']
    center = meta['center']
    schema_sql = f"""
        CREATE TABLE IF NOT EXISTS {table} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thermo_code TEXT,
            name TEXT NOT NULL,
            status TEXT,
            center TEXT NOT NULL DEFAULT '{center}',
            position_x REAL NOT NULL,
            position_y REAL NOT NULL,
            width_pct REAL NOT NULL DEFAULT 0,
            height_pct REAL NOT NULL DEFAULT 0,
            width REAL,
            height REAL,
            remark TEXT,
            racks_json TEXT,
            box_identifier TEXT UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT NOT NULL,
            updated_at TEXT,
            updated_by TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (thermo_code) REFERENCES org_thermometer(device_code),
            FOREIGN KEY (center) REFERENCES org_rack(center_code)
        )
    """
    try:
        with _get_connection(app) as conn:
            conn.execute(schema_sql)
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{table}_deleted ON {table}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{table}_center ON {table}(center)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{table}_box ON {table}(box_identifier)"
            )
            conn.commit()
            logger.info('%s table ready', table)
    except Exception:
        logger.exception('Failed to initialize table for %s', table)
        raise


def _deserialize_racks(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if isinstance(data, list):
        return [str(item).strip() for item in data if str(item).strip()]
    return []


def _serialize_racks(values: Any) -> str:
    if not values:
        return '[]'
    if isinstance(values, str):
        parts = [values]
    else:
        parts = list(values)
    cleaned = [str(item).strip() for item in parts if str(item).strip()]
    return json.dumps(cleaned, ensure_ascii=False)


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    return {
        'id': row['id'],
        'thermo_code': row['thermo_code'] or '',
        'name': row['name'] or '',
        'status': row['status'] or '',
        'center': row['center'] or '',
        'position_x': float(row['position_x'] or 0.0),
        'position_y': float(row['position_y'] or 0.0),
        'width_pct': float(row['width_pct'] or 0.0),
        'height_pct': float(row['height_pct'] or 0.0),
        'width': float(row['width']) if row['width'] is not None else None,
        'height': float(row['height']) if row['height'] is not None else None,
        'remark': row['remark'] or '',
        'racks': _deserialize_racks(row['racks_json']),
        'box_identifier': row['box_identifier'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': int(row['is_deleted'] or 0),
    }


def _clean_float(value: Any, *, default: Optional[float] = 0.0, allow_none: bool = False) -> Optional[float]:
    if value in (None, '', 'null'):
        return None if allow_none else (default if default is not None else 0.0)
    try:
        return float(value)
    except (TypeError, ValueError):
        if allow_none:
            return None
        raise ValueError('좌표/크기 값이 올바르지 않습니다.')


def _normalize_racks(values: Any) -> List[str]:
    if not values:
        return []
    if isinstance(values, str):
        try:
            parsed = json.loads(values)
            if isinstance(parsed, list):
                values = parsed
            else:
                values = [values]
        except Exception:
            values = [values]
    if isinstance(values, (list, tuple, set)):
        cleaned = []
        seen = set()
        for item in values:
            token = str(item).strip()
            if token and token not in seen:
                seen.add(token)
                cleaned.append(token)
        return cleaned
    return []


def _base_payload(data: Dict[str, Any], meta: Dict[str, str]) -> Dict[str, Any]:
    name = (data.get('name') or data.get('text') or '').strip()
    if not name:
        raise ValueError('온/습도계 이름은 필수입니다.')
    box_identifier = (data.get('box_identifier') or '').strip()
    if not box_identifier:
        box_identifier = f"thermo_{uuid.uuid4().hex[:10]}"
    payload = {
        'thermo_code': (data.get('thermo_code') or '').strip() or None,
        'name': name,
        'status': (data.get('status') or '').strip() or None,
        'center': (data.get('center') or meta['center']).strip() or meta['center'],
        'position_x': _clean_float(data.get('position_x'), default=0.0),
        'position_y': _clean_float(data.get('position_y'), default=0.0),
        'width_pct': _clean_float(data.get('width_pct'), default=0.0),
        'height_pct': _clean_float(data.get('height_pct'), default=0.0),
        'width': _clean_float(data.get('width'), default=None, allow_none=True),
        'height': _clean_float(data.get('height'), default=None, allow_none=True),
        'remark': (data.get('remark') or '').strip() or None,
        'racks_json': _serialize_racks(_normalize_racks(data.get('racks'))),
        'box_identifier': box_identifier,
    }
    return payload


def _list_records(key: str, *, search: Optional[str] = None, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    meta = _lab_meta(key)
    table = meta['table']
    clauses = ['center = ?']
    params: List[Any] = [meta['center']]
    if not include_deleted:
        clauses.append('is_deleted = 0')
    if search:
        like = f"%{search.strip()}%"
        clauses.append('(name LIKE ? OR status LIKE ? OR box_identifier LIKE ? OR remark LIKE ?)')
        params.extend([like, like, like, like])
    query = (
        f"SELECT id, thermo_code, name, status, center, position_x, position_y, width_pct, height_pct, width, height, remark, racks_json, box_identifier, created_at, created_by, updated_at, updated_by, is_deleted "
        f"FROM {table} WHERE {' AND '.join(clauses)} ORDER BY id ASC"
    )
    with _get_connection(app) as conn:
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def _get_record(key: str, record_id: int, app=None) -> Optional[Dict[str, Any]]:
    meta = _lab_meta(key)
    table = meta['table']
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, thermo_code, name, status, center, position_x, position_y, width_pct, height_pct, width, height, remark, racks_json, box_identifier, created_at, created_by, updated_at, updated_by, is_deleted FROM {table} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def _create_record(key: str, data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    meta = _lab_meta(key)
    table = meta['table']
    actor = (actor or 'system').strip() or 'system'
    payload = _base_payload(data, meta)
    timestamp = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {table} (
                thermo_code, name, status, center, position_x, position_y, width_pct, height_pct, width, height,
                remark, racks_json, box_identifier, created_at, created_by, updated_at, updated_by, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                payload['thermo_code'],
                payload['name'],
                payload['status'],
                payload['center'],
                payload['position_x'],
                payload['position_y'],
                payload['width_pct'],
                payload['height_pct'],
                payload['width'],
                payload['height'],
                payload['remark'],
                payload['racks_json'],
                payload['box_identifier'],
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = cur.lastrowid
        conn.commit()
    return _get_record(key, new_id, app)


def _update_record(key: str, record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    meta = _lab_meta(key)
    table = meta['table']
    actor = (actor or 'system').strip() or 'system'
    assignments: List[str] = []
    params: List[Any] = []
    mutable_fields = {
        'thermo_code': lambda v: (v or '').strip() or None,
        'name': lambda v: (v or '').strip(),
        'status': lambda v: (v or '').strip() or None,
        'center': lambda v: (v or '').strip() or meta['center'],
        'position_x': lambda v: _clean_float(v, default=0.0),
        'position_y': lambda v: _clean_float(v, default=0.0),
        'width_pct': lambda v: _clean_float(v, default=0.0),
        'height_pct': lambda v: _clean_float(v, default=0.0),
        'width': lambda v: _clean_float(v, default=None, allow_none=True),
        'height': lambda v: _clean_float(v, default=None, allow_none=True),
        'remark': lambda v: (v or '').strip() or None,
        'racks': lambda v: _serialize_racks(_normalize_racks(v)),
        'box_identifier': lambda v: (v or '').strip() or None,
    }
    for key_name, transformer in mutable_fields.items():
        if key_name in data:
            value = transformer(data.get(key_name))
            if key_name == 'name' and not value:
                raise ValueError('온/습도계 이름은 비워둘 수 없습니다.')
            column = 'racks_json' if key_name == 'racks' else key_name
            assignments.append(f'{column} = ?')
            params.append(value)
    if not assignments:
        return _get_record(key, record_id, app)
    timestamp = _now()
    assignments.extend(['updated_at = ?', 'updated_by = ?', 'is_deleted = 0'])
    params.extend([timestamp, actor, record_id])
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {table} SET {', '.join(assignments)} WHERE id = ?",
            params,
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    return _get_record(key, record_id, app)


def _soft_delete_records(key: str, ids: Sequence[Any], actor: str, app=None) -> int:
    meta = _lab_meta(key)
    table = meta['table']
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    timestamp = _now()
    with _get_connection(app) as conn:
        params: List[Any] = [timestamp, actor, *safe_ids]
        cur = conn.execute(
            f"UPDATE {table} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            params,
        )
        conn.commit()
        return cur.rowcount


def _sync_records(key: str, items: Sequence[Dict[str, Any]], actor: str, app=None) -> Dict[str, int]:
    if not isinstance(items, (list, tuple)):
        raise ValueError('동기화 항목은 배열이어야 합니다.')
    meta = _lab_meta(key)
    table = meta['table']
    actor = (actor or 'system').strip() or 'system'
    normalized: List[Dict[str, Any]] = []
    seen_boxes: set[str] = set()
    for raw in items:
        if not isinstance(raw, dict):
            continue
        try:
            payload = _base_payload(raw, meta)
        except ValueError:
            continue
        if payload['box_identifier'] in seen_boxes:
            continue
        seen_boxes.add(payload['box_identifier'])
        normalized.append(payload)
    timestamp = _now()
    created = 0
    updated = 0
    deleted = 0
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT id, box_identifier FROM {table}"
        ).fetchall()
        existing_map = {
            (row['box_identifier'] or ''): row['id']
            for row in rows if (row['box_identifier'] or '')
        }
        active_ids: set[int] = set()
        for payload in normalized:
            row_id = existing_map.get(payload['box_identifier'])
            if row_id:
                conn.execute(
                    f"""
                    UPDATE {table}
                    SET thermo_code = ?, name = ?, status = ?, center = ?, position_x = ?, position_y = ?,
                        width_pct = ?, height_pct = ?, width = ?, height = ?, remark = ?, racks_json = ?,
                        box_identifier = ?, updated_at = ?, updated_by = ?, is_deleted = 0
                    WHERE id = ?
                    """,
                    (
                        payload['thermo_code'],
                        payload['name'],
                        payload['status'],
                        payload['center'],
                        payload['position_x'],
                        payload['position_y'],
                        payload['width_pct'],
                        payload['height_pct'],
                        payload['width'],
                        payload['height'],
                        payload['remark'],
                        payload['racks_json'],
                        payload['box_identifier'],
                        timestamp,
                        actor,
                        row_id,
                    ),
                )
                updated += 1
                active_ids.add(row_id)
            else:
                cur = conn.execute(
                    f"""
                    INSERT INTO {table} (
                        thermo_code, name, status, center, position_x, position_y, width_pct, height_pct, width,
                        height, remark, racks_json, box_identifier, created_at, created_by, updated_at, updated_by, is_deleted
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        payload['thermo_code'],
                        payload['name'],
                        payload['status'],
                        payload['center'],
                        payload['position_x'],
                        payload['position_y'],
                        payload['width_pct'],
                        payload['height_pct'],
                        payload['width'],
                        payload['height'],
                        payload['remark'],
                        payload['racks_json'],
                        payload['box_identifier'],
                        timestamp,
                        actor,
                        timestamp,
                        actor,
                    ),
                )
                new_id = cur.lastrowid
                created += 1
                active_ids.add(new_id)
        obsolete_ids = [row_id for row_id in existing_map.values() if row_id not in active_ids]
        if obsolete_ids:
            placeholders = ','.join('?' for _ in obsolete_ids)
            conn.execute(
                f"UPDATE {table} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
                [timestamp, actor, *obsolete_ids],
            )
            deleted = len(obsolete_ids)
        conn.commit()
    return {'created': created, 'updated': updated, 'deleted': deleted}


# Public helpers -------------------------------------------------------------

def init_system_lab1_thermometer_table(app=None) -> None:
    _ensure_table('lab1', app)


def init_system_lab2_thermometer_table(app=None) -> None:
    _ensure_table('lab2', app)


def init_system_lab3_thermometer_table(app=None) -> None:
    _ensure_table('lab3', app)


def init_system_lab4_thermometer_table(app=None) -> None:
    _ensure_table('lab4', app)


def list_system_lab1_thermometers(*, search: Optional[str] = None, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    return _list_records('lab1', search=search, include_deleted=include_deleted, app=app)


def list_system_lab2_thermometers(*, search: Optional[str] = None, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    return _list_records('lab2', search=search, include_deleted=include_deleted, app=app)


def list_system_lab3_thermometers(*, search: Optional[str] = None, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    return _list_records('lab3', search=search, include_deleted=include_deleted, app=app)


def list_system_lab4_thermometers(*, search: Optional[str] = None, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    return _list_records('lab4', search=search, include_deleted=include_deleted, app=app)


def create_system_lab1_thermometer(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    return _create_record('lab1', data, actor, app)


def create_system_lab2_thermometer(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    return _create_record('lab2', data, actor, app)


def create_system_lab3_thermometer(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    return _create_record('lab3', data, actor, app)


def create_system_lab4_thermometer(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    return _create_record('lab4', data, actor, app)


def update_system_lab1_thermometer(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    return _update_record('lab1', record_id, data, actor, app)


def update_system_lab2_thermometer(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    return _update_record('lab2', record_id, data, actor, app)


def update_system_lab3_thermometer(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    return _update_record('lab3', record_id, data, actor, app)


def update_system_lab4_thermometer(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    return _update_record('lab4', record_id, data, actor, app)


def soft_delete_system_lab1_thermometers(ids: Sequence[Any], actor: str, app=None) -> int:
    return _soft_delete_records('lab1', ids, actor, app)


def soft_delete_system_lab2_thermometers(ids: Sequence[Any], actor: str, app=None) -> int:
    return _soft_delete_records('lab2', ids, actor, app)


def soft_delete_system_lab3_thermometers(ids: Sequence[Any], actor: str, app=None) -> int:
    return _soft_delete_records('lab3', ids, actor, app)


def soft_delete_system_lab4_thermometers(ids: Sequence[Any], actor: str, app=None) -> int:
    return _soft_delete_records('lab4', ids, actor, app)


def sync_system_lab1_thermometers(items: Sequence[Dict[str, Any]], actor: str, app=None) -> Dict[str, int]:
    return _sync_records('lab1', items, actor, app)


def sync_system_lab2_thermometers(items: Sequence[Dict[str, Any]], actor: str, app=None) -> Dict[str, int]:
    return _sync_records('lab2', items, actor, app)


def sync_system_lab3_thermometers(items: Sequence[Dict[str, Any]], actor: str, app=None) -> Dict[str, int]:
    return _sync_records('lab3', items, actor, app)


def sync_system_lab4_thermometers(items: Sequence[Dict[str, Any]], actor: str, app=None) -> Dict[str, int]:
    return _sync_records('lab4', items, actor, app)
