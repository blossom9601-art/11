import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'system_lab3_surface'
DEFAULT_COLOR = '#60a5fa'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    direct_path = app.config.get('SYSTEM_LAB3_SURFACE_SQLITE_PATH')
    if direct_path:
        return os.path.abspath(direct_path)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):  # fall back to instance-local sqlite file
        return os.path.join(app.instance_path, 'system_lab3_surface.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'system_lab3_surface.db')
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


def _ensure_optional_column(conn: sqlite3.Connection, name: str, ddl: str) -> None:
    rows = conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()
    names = {row[1] for row in rows}
    if name not in names:
        conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {ddl}")


def _ensure_indexes(conn: sqlite3.Connection) -> None:
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_center ON {TABLE_NAME}(center_code)")
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)")
    conn.commit()


def init_system_lab3_surface_table(app=None) -> None:
    app = app or current_app
    schema_sql = f"""
        CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            surface_name TEXT NOT NULL,
            center_code TEXT NOT NULL,
            rack_position TEXT,
            position_x REAL NOT NULL,
            position_y REAL NOT NULL,
            width INTEGER,
            height INTEGER,
            color_hex TEXT NOT NULL DEFAULT '{DEFAULT_COLOR}',
            note TEXT,
            left_pct REAL NOT NULL DEFAULT 0,
            top_pct REAL NOT NULL DEFAULT 0,
            width_pct REAL NOT NULL DEFAULT 0,
            height_pct REAL NOT NULL DEFAULT 0,
            box_identifier TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT NOT NULL,
            updated_at TEXT,
            updated_by TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (center_code) REFERENCES org_rack(center_code),
            FOREIGN KEY (rack_position) REFERENCES org_rack(rack_position)
        )
    """
    try:
        with _get_connection(app) as conn:
            conn.execute(schema_sql)
            _ensure_optional_column(conn, 'color_hex', f"TEXT NOT NULL DEFAULT '{DEFAULT_COLOR}'")
            _ensure_optional_column(conn, 'left_pct', 'REAL NOT NULL DEFAULT 0')
            _ensure_optional_column(conn, 'top_pct', 'REAL NOT NULL DEFAULT 0')
            _ensure_optional_column(conn, 'width_pct', 'REAL NOT NULL DEFAULT 0')
            _ensure_optional_column(conn, 'height_pct', 'REAL NOT NULL DEFAULT 0')
            _ensure_optional_column(conn, 'box_identifier', 'TEXT')
            _ensure_indexes(conn)
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    rack_value = row['rack_position'] or ''
    left_pct = row['left_pct'] if 'left_pct' in row.keys() else None
    top_pct = row['top_pct'] if 'top_pct' in row.keys() else None
    width_pct = row['width_pct'] if 'width_pct' in row.keys() else None
    height_pct = row['height_pct'] if 'height_pct' in row.keys() else None
    return {
        'id': row['id'],
        'surface_name': row['surface_name'] or '',
        'center_code': row['center_code'] or '',
        'rack_position': rack_value,
        'rack_positions': [rack_value] if rack_value else [],
        'position_x': float(row['position_x'] or 0.0),
        'position_y': float(row['position_y'] or 0.0),
        'width': int(row['width']) if row['width'] is not None else None,
        'height': int(row['height']) if row['height'] is not None else None,
        'color_hex': row['color_hex'] or DEFAULT_COLOR,
        'note': row['note'] or '',
        'remark': row['note'] or '',
        'left_pct': float(left_pct) if left_pct is not None else None,
        'top_pct': float(top_pct) if top_pct is not None else None,
        'width_pct': float(width_pct) if width_pct is not None else None,
        'height_pct': float(height_pct) if height_pct is not None else None,
        'box_identifier': row['box_identifier'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': int(row['is_deleted'] or 0),
    }


def list_system_lab3_surfaces(*, center_code: Optional[str] = None, include_deleted: bool = False, search: Optional[str] = None, app=None) -> List[Dict[str, Any]]:
    app = app or current_app
    clauses = ['1=1']
    params: List[Any] = []
    if not include_deleted:
        clauses.append('is_deleted = 0')
    if center_code:
        clauses.append('center_code = ?')
        params.append(center_code.strip())
    if search:
        like = f"%{search.strip()}%"
        clauses.append('(surface_name LIKE ? OR rack_position LIKE ? OR note LIKE ?)')
        params.extend([like, like, like])
    query = (
        f"SELECT id, surface_name, center_code, rack_position, position_x, position_y, width, height, color_hex, note, left_pct, top_pct, width_pct, height_pct, box_identifier, created_at, created_by, updated_at, updated_by, is_deleted "
        f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
    )
    with _get_connection(app) as conn:
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_system_lab3_surface(surface_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, surface_name, center_code, rack_position, position_x, position_y, width, height, color_hex, note, left_pct, top_pct, width_pct, height_pct, box_identifier, created_at, created_by, updated_at, updated_by, is_deleted FROM {TABLE_NAME} WHERE id = ?",
            (surface_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def _normalize_color(value: Optional[str]) -> str:
    raw = (value or '').strip() or DEFAULT_COLOR
    if not raw.startswith('#'):
        raw = f"#{raw}"
    if len(raw) == 7:
        return raw
    return DEFAULT_COLOR


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if value is None or value == '':
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_pct(value: Any, default: float = 0.0) -> float:
    try:
        val = float(value)
    except (TypeError, ValueError):
        val = default
    return max(0.0, min(val, 1.0))


def create_system_lab3_surface(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    surface_name = (data.get('surface_name') or '').strip()
    if not surface_name:
        raise ValueError('surface_name is required')
    center_code = (data.get('center_code') or '').strip()
    if not center_code:
        raise ValueError('center_code is required')
    rack_position = (data.get('rack_position') or '').strip() or None
    left_pct = _coerce_pct(data.get('left_pct'), _coerce_float(data.get('position_x'), 0.0))
    top_pct = _coerce_pct(data.get('top_pct'), _coerce_float(data.get('position_y'), 0.0))
    width_pct = _coerce_pct(data.get('width_pct'), 0.0)
    height_pct = _coerce_pct(data.get('height_pct'), 0.0)
    position_x = left_pct
    position_y = top_pct
    width = None
    height = None
    note = (data.get('note') or data.get('remark') or '').strip() or None
    color_hex = _normalize_color(data.get('color_hex'))
    box_identifier = (data.get('box_identifier') or '').strip() or None
    timestamp = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                surface_name,
                center_code,
                rack_position,
                position_x,
                position_y,
                width,
                height,
                color_hex,
                note,
                left_pct,
                top_pct,
                width_pct,
                height_pct,
                box_identifier,
                created_at,
                created_by,
                updated_at,
                updated_by,
                is_deleted
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0
            )
            """,
            (
                surface_name,
                center_code,
                rack_position,
                position_x,
                position_y,
                width,
                height,
                color_hex,
                note,
                left_pct,
                top_pct,
                width_pct,
                height_pct,
                box_identifier,
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = cur.lastrowid
        conn.commit()
    return get_system_lab3_surface(new_id, app)


def update_system_lab3_surface(surface_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    assignments: List[str] = []
    params: List[Any] = []
    field_map = {
        'surface_name': 'surface_name',
        'center_code': 'center_code',
        'rack_position': 'rack_position',
        'note': 'note',
        'remark': 'note',
    }
    for payload_key, column in field_map.items():
        if payload_key in data:
            value = (data.get(payload_key) or '').strip()
            if column in ('surface_name', 'center_code') and not value:
                raise ValueError(f'{payload_key} cannot be empty')
            assignments.append(f'{column} = ?')
            params.append(value or None)
    if 'color_hex' in data:
        assignments.append('color_hex = ?')
        params.append(_normalize_color(data.get('color_hex')))
    if 'box_identifier' in data:
        assignments.append('box_identifier = ?')
        params.append((data.get('box_identifier') or '').strip() or None)
    for geom_key in ('position_x', 'position_y'):
        if geom_key in data:
            assignments.append(f'{geom_key} = ?')
            params.append(_coerce_float(data.get(geom_key), 0.0))
    for size_key in ('width', 'height'):
        if size_key in data:
            assignments.append(f'{size_key} = ?')
            params.append(_coerce_int(data.get(size_key)))
    for pct_key in ('left_pct', 'top_pct', 'width_pct', 'height_pct'):
        if pct_key in data:
            pct_val = _coerce_pct(data.get(pct_key))
            assignments.append(f'{pct_key} = ?')
            params.append(pct_val)
            if pct_key == 'left_pct':
                assignments.append('position_x = ?')
                params.append(pct_val)
            elif pct_key == 'top_pct':
                assignments.append('position_y = ?')
                params.append(pct_val)
            elif pct_key == 'width_pct':
                assignments.append('width = ?')
                params.append(_coerce_int(round(pct_val * 1000)))
            elif pct_key == 'height_pct':
                assignments.append('height = ?')
                params.append(_coerce_int(round(pct_val * 1000)))
    if not assignments:
        return get_system_lab3_surface(surface_id, app)
    timestamp = _now()
    assignments.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, surface_id])
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(assignments)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    return get_system_lab3_surface(surface_id, app)


def soft_delete_system_lab3_surfaces(ids: Sequence[int], actor: str, app=None) -> int:
    app = app or current_app
    if not ids:
        return 0
    actor = (actor or 'system').strip() or 'system'
    placeholders = ','.join('?' for _ in ids)
    params: List[Any] = [_now(), actor, *_clean_ids(ids)]
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            params,
        )
        conn.commit()
        return cur.rowcount


def bulk_update_surface_geometry(items: Iterable[Dict[str, Any]], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    rows = []
    for item in items or []:
        surface_id = _coerce_int(item.get('id'))
        if not surface_id:
            continue
        left_pct = _coerce_pct(item.get('left_pct'), _coerce_float(item.get('position_x'), 0.0))
        top_pct = _coerce_pct(item.get('top_pct'), _coerce_float(item.get('position_y'), 0.0))
        width_pct = _coerce_pct(item.get('width_pct'), _coerce_float(item.get('width_pct'), 0.0))
        height_pct = _coerce_pct(item.get('height_pct'), _coerce_float(item.get('height_pct'), 0.0))
        width_val = _coerce_int(item.get('width'))
        if width_val is None and width_pct is not None:
            width_val = _coerce_int(round(width_pct * 1000))
        height_val = _coerce_int(item.get('height'))
        if height_val is None and height_pct is not None:
            height_val = _coerce_int(round(height_pct * 1000))
        rows.append(
            (
                left_pct,
                top_pct,
                width_pct,
                height_pct,
                left_pct,
                top_pct,
                width_val,
                height_val,
                _now(),
                actor,
                surface_id,
            )
        )
    if not rows:
        return 0
    with _get_connection(app) as conn:
        cur = conn.executemany(
            f"UPDATE {TABLE_NAME} SET left_pct = ?, top_pct = ?, width_pct = ?, height_pct = ?, position_x = ?, position_y = ?, width = ?, height = ?, updated_at = ?, updated_by = ? WHERE id = ? AND is_deleted = 0",
            rows,
        )
        conn.commit()
        return cur.rowcount


def _clean_ids(ids: Sequence[Any]) -> List[int]:
    cleaned: List[int] = []
    for value in ids:
        iv = _coerce_int(value)
        if iv:
            cleaned.append(iv)
    return cleaned
