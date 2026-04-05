import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'data_delete_system'
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500

ORDERABLE_COLUMNS = {
    'id': 'id',
    'business_status_code': 'business_status_code',
    'business_name': 'business_name',
    'system_name': 'system_name',
    'system_ip': 'system_ip',
    'mgmt_ip': 'mgmt_ip',
    'manufacturer_code': 'manufacturer_code',
    'system_model_name': 'system_model_name',
    'serial_number': 'serial_number',
    'center_code': 'center_code',
    'rack_position': 'rack_position',
    'rack_code': 'rack_code',
    'system_dept_code': 'system_dept_code',
    'system_manager_id': 'system_manager_id',
    'service_dept_code': 'service_dept_code',
    'service_manager_id': 'service_manager_id',
    'last_delete_at': 'last_delete_at',
    'next_planned_delete_at': 'next_planned_delete_at',
    'created_at': 'created_at',
    'updated_at': 'updated_at',
}

SEARCHABLE_COLUMNS = (
    'business_status_code',
    'business_name',
    'system_name',
    'system_ip',
    'mgmt_ip',
    'manufacturer_code',
    'system_model_name',
    'serial_number',
    'center_code',
    'rack_position',
    'rack_code',
    'system_dept_code',
    'service_dept_code',
    'delete_target_desc',
    'retention_policy',
    'remark',
)


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('DATA_DELETE_SYSTEM_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'data_delete_system.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'data_delete_system.db')
    if netloc and netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    relative = path.lstrip('/')
    resolved = relative if os.path.isabs(relative) else os.path.abspath(os.path.join(_project_root(app), relative))
    return resolved


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


def _clean_text(value: Any) -> Optional[str]:
    text = (str(value).strip() if value is not None else '')
    return text or None


def _require_text(data: Dict[str, Any], key: str) -> str:
    value = (data.get(key) or '').strip()
    if not value:
        raise ValueError(f'{key} is required')
    return value


def _normalize_actor_id(actor_id: Any) -> int:
    if actor_id in (None, ''):
        return 0
    try:
        value = int(actor_id)
    except (TypeError, ValueError) as exc:
        raise ValueError('actor_id must be an integer') from exc
    if value < 0:
        raise ValueError('actor_id must be non-negative')
    return value


def _to_int_or_none(value: Any) -> Optional[int]:
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError('must be an integer')


def _is_int_like(value: Any) -> bool:
    if value in (None, ''):
        return False
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    text = str(value).strip()
    if not text:
        return False
    if text[0] in ('+', '-'):
        text = text[1:]
    return text.isdigit()


def _normalize_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    """Accept both spec keys and existing UI keys."""
    data = dict(data or {})

    # --- Aliases from UI templates/js ---
    if not data.get('business_status_code') and data.get('business_status'):
        data['business_status_code'] = data.get('business_status')
    if not data.get('mgmt_ip') and data.get('manage_ip'):
        data['mgmt_ip'] = data.get('manage_ip')
    if not data.get('manufacturer_code') and data.get('vendor'):
        data['manufacturer_code'] = data.get('vendor')
    if not data.get('system_model_name') and data.get('model'):
        data['system_model_name'] = data.get('model')
    if not data.get('serial_number') and data.get('serial'):
        data['serial_number'] = data.get('serial')
    if not data.get('center_code') and data.get('place'):
        data['center_code'] = data.get('place')
    if not data.get('rack_position') and data.get('location'):
        data['rack_position'] = data.get('location')
    if not data.get('system_dept_code') and data.get('system_owner_dept'):
        data['system_dept_code'] = data.get('system_owner_dept')
    if not data.get('service_dept_code') and data.get('service_owner_dept'):
        data['service_dept_code'] = data.get('service_owner_dept')
    if data.get('system_manager_id') in (None, '') and data.get('system_owner') not in (None, ''):
        data['system_manager_id'] = data.get('system_owner')
    if data.get('service_manager_id') in (None, '') and data.get('service_owner') not in (None, ''):
        data['service_manager_id'] = data.get('service_owner')

    normalized: Dict[str, Any] = {}
    for key in (
        'business_status_code',
        'business_name',
        'system_name',
        'system_ip',
        'mgmt_ip',
        'manufacturer_code',
        'system_model_name',
        'serial_number',
        'center_code',
        'rack_position',
        'rack_code',
        'system_dept_code',
        'system_manager_id',
        'service_dept_code',
        'service_manager_id',
        'delete_target_desc',
        'retention_policy',
        'last_delete_at',
        'next_planned_delete_at',
        'remark',
    ):
        if key not in data:
            continue
        if key in ('system_manager_id', 'service_manager_id'):
            # UI may provide either a numeric org_user.id OR a free-text name.
            # SQLite foreign keys aren't enforced in this app's sqlite3 service usage,
            # so we store the raw value when it's not numeric to keep UI round-trips usable.
            value = data.get(key)
            if value in (None, ''):
                normalized[key] = None
            elif _is_int_like(value):
                try:
                    normalized[key] = int(value)
                except (TypeError, ValueError) as exc:
                    raise ValueError(f'{key} must be an integer') from exc
            else:
                normalized[key] = _clean_text(value)
        elif key.endswith('_id'):
            if data.get(key) in (None, ''):
                normalized[key] = None
            else:
                try:
                    normalized[key] = _to_int_or_none(data.get(key))
                except ValueError as exc:
                    raise ValueError(f'{key} {exc}') from exc
        else:
            normalized[key] = _clean_text(data.get(key))

    return normalized


def _resolve_order(order: Optional[str]) -> str:
    if not order:
        return 'system_name ASC, id DESC'
    direction = 'ASC'
    column = order
    if order.startswith('-'):
        direction = 'DESC'
        column = order[1:]
    mapped = ORDERABLE_COLUMNS.get((column or '').lower())
    if not mapped:
        return 'system_name ASC, id DESC'
    return f"{mapped} {direction}"


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    item = {
        'id': row['id'],
        'business_status_code': row['business_status_code'],
        'business_name': row['business_name'],
        'system_name': row['system_name'],
        'system_ip': row['system_ip'] or '',
        'mgmt_ip': row['mgmt_ip'] or '',
        'manufacturer_code': row['manufacturer_code'] or '',
        'system_model_name': row['system_model_name'] or '',
        'serial_number': row['serial_number'] or '',
        'center_code': row['center_code'] or '',
        'rack_position': row['rack_position'] or '',
        'rack_code': row['rack_code'] or '',
        'system_dept_code': row['system_dept_code'] or '',
        'system_manager_id': row['system_manager_id'],
        'service_dept_code': row['service_dept_code'] or '',
        'service_manager_id': row['service_manager_id'],
        'delete_target_desc': row['delete_target_desc'] or '',
        'retention_policy': row['retention_policy'] or '',
        'last_delete_at': row['last_delete_at'] or '',
        'next_planned_delete_at': row['next_planned_delete_at'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }

    # --- Backward/UI-friendly aliases ---
    item['business_status'] = item['business_status_code']
    item['manage_ip'] = item['mgmt_ip']
    item['vendor'] = item['manufacturer_code']
    item['model'] = item['system_model_name']
    item['serial'] = item['serial_number']
    item['place'] = item['center_code']
    item['location'] = item['rack_position']
    item['system_owner_dept'] = item['system_dept_code']
    item['system_owner'] = item['system_manager_id']
    item['service_owner_dept'] = item['service_dept_code']
    item['service_owner'] = item['service_manager_id']

    return item


def init_data_delete_system_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    business_status_code TEXT NOT NULL,
                    business_name TEXT NOT NULL,
                    system_name TEXT NOT NULL,
                    system_ip TEXT,
                    mgmt_ip TEXT,
                    manufacturer_code TEXT,
                    system_model_name TEXT,
                    serial_number TEXT,
                    center_code TEXT,
                    rack_position TEXT,
                    rack_code TEXT,
                    system_dept_code TEXT,
                    system_manager_id INTEGER,
                    service_dept_code TEXT,
                    service_manager_id INTEGER,
                    delete_target_desc TEXT,
                    retention_policy TEXT,
                    last_delete_at TEXT,
                    next_planned_delete_at TEXT,
                    remark TEXT,
                    created_at TEXT NOT NULL,
                    created_by INTEGER NOT NULL,
                    updated_at TEXT,
                    updated_by INTEGER,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (business_status_code) REFERENCES biz_work_status(status_code),
                    FOREIGN KEY (manufacturer_code) REFERENCES biz_vendor_manufacturer(manufacturer_code),
                    FOREIGN KEY (center_code) REFERENCES org_center(center_code),
                    FOREIGN KEY (rack_code) REFERENCES org_rack(rack_code),
                    FOREIGN KEY (system_dept_code) REFERENCES org_department(dept_code),
                    FOREIGN KEY (service_dept_code) REFERENCES org_department(dept_code),
                    FOREIGN KEY (system_manager_id) REFERENCES org_user(id),
                    FOREIGN KEY (service_manager_id) REFERENCES org_user(id),
                    FOREIGN KEY (created_by) REFERENCES org_user(id),
                    FOREIGN KEY (updated_by) REFERENCES org_user(id)
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_business_status ON {TABLE_NAME}(business_status_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_system_name ON {TABLE_NAME}(system_name)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_is_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
    except Exception:
        logger.exception('Failed to init %s table', TABLE_NAME)
        raise


def get_data_delete_system(system_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            row = conn.execute(
                f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
                (system_id,),
            ).fetchone()
            if not row:
                return None
            return _row_to_dict(row)
    except Exception:
        logger.exception('Failed to fetch %s %s', TABLE_NAME, system_id)
        raise


def list_data_delete_systems(
    *,
    search: Optional[str] = None,
    include_deleted: bool = False,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    order: Optional[str] = None,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app

    resolved_page = max(1, int(page or 1))
    resolved_page_size = int(page_size or DEFAULT_PAGE_SIZE)
    resolved_page_size = max(1, min(resolved_page_size, MAX_PAGE_SIZE))
    offset = (resolved_page - 1) * resolved_page_size
    order_sql = _resolve_order(order)

    where_parts: List[str] = []
    params: List[Any] = []

    if not include_deleted:
        where_parts.append('is_deleted = 0')

    if search:
        tokens = [token.strip() for token in str(search).split('%') if token.strip()]
        for token in tokens:
            like = f"%{token}%"
            or_parts = []
            for col in SEARCHABLE_COLUMNS:
                or_parts.append(f"{col} LIKE ?")
                params.append(like)
            where_parts.append('(' + ' OR '.join(or_parts) + ')')

    where_sql = ('WHERE ' + ' AND '.join(where_parts)) if where_parts else ''

    try:
        with _get_connection(app) as conn:
            total = conn.execute(
                f"SELECT COUNT(*) AS cnt FROM {TABLE_NAME} {where_sql}",
                tuple(params),
            ).fetchone()['cnt']
            rows = conn.execute(
                f"""
                SELECT *
                FROM {TABLE_NAME}
                {where_sql}
                ORDER BY {order_sql}
                LIMIT ? OFFSET ?
                """,
                tuple(params + [resolved_page_size, offset]),
            ).fetchall()
            items = [_row_to_dict(r) for r in rows]
            return {
                'items': items,
                'total': int(total or 0),
                'page': resolved_page,
                'page_size': resolved_page_size,
            }
    except Exception:
        logger.exception('Failed to list %s rows', TABLE_NAME)
        raise


def create_data_delete_system(data: Dict[str, Any], actor_id: Any, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = _normalize_actor_id(actor_id)
    payload = _normalize_payload(data)

    business_status_code = _require_text(payload, 'business_status_code')
    business_name = _require_text(payload, 'business_name')
    system_name = _require_text(payload, 'system_name')

    now = _now()

    columns = [
        'business_status_code',
        'business_name',
        'system_name',
        'system_ip',
        'mgmt_ip',
        'manufacturer_code',
        'system_model_name',
        'serial_number',
        'center_code',
        'rack_position',
        'rack_code',
        'system_dept_code',
        'system_manager_id',
        'service_dept_code',
        'service_manager_id',
        'delete_target_desc',
        'retention_policy',
        'last_delete_at',
        'next_planned_delete_at',
        'remark',
        'created_at',
        'created_by',
        'updated_at',
        'updated_by',
        'is_deleted',
    ]

    values = {
        **payload,
        'business_status_code': business_status_code,
        'business_name': business_name,
        'system_name': system_name,
        'created_at': now,
        'created_by': actor,
        'updated_at': None,
        'updated_by': None,
        'is_deleted': 0,
    }

    placeholders = ','.join(['?'] * len(columns))
    sql = f"INSERT INTO {TABLE_NAME} ({', '.join(columns)}) VALUES ({placeholders})"
    params = [values.get(col) for col in columns]

    try:
        with _get_connection(app) as conn:
            cur = conn.execute(sql, tuple(params))
            system_id = cur.lastrowid
            conn.commit()
        item = get_data_delete_system(int(system_id), app)
        if not item:
            raise RuntimeError('created item not found')
        return item
    except sqlite3.IntegrityError as exc:
        raise ValueError(str(exc)) from exc
    except Exception:
        logger.exception('Failed to create %s row', TABLE_NAME)
        raise


def update_data_delete_system(system_id: int, data: Dict[str, Any], actor_id: Any, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = _normalize_actor_id(actor_id)
    payload = _normalize_payload(data)
    if not payload:
        return get_data_delete_system(system_id, app)

    # Do not allow id overwrite
    payload.pop('id', None)

    set_parts: List[str] = []
    params: List[Any] = []

    for key, value in payload.items():
        set_parts.append(f"{key} = ?")
        params.append(value)

    set_parts.append('updated_at = ?')
    params.append(_now())
    set_parts.append('updated_by = ?')
    params.append(actor)

    params.append(system_id)

    sql = f"UPDATE {TABLE_NAME} SET {', '.join(set_parts)} WHERE id = ?"

    try:
        with _get_connection(app) as conn:
            cur = conn.execute(sql, tuple(params))
            conn.commit()
            if cur.rowcount == 0:
                return None
        return get_data_delete_system(system_id, app)
    except sqlite3.IntegrityError as exc:
        raise ValueError(str(exc)) from exc
    except Exception:
        logger.exception('Failed to update %s %s', TABLE_NAME, system_id)
        raise


def delete_data_delete_systems(ids: Sequence[Any], actor_id: Any, app=None) -> int:
    """물리 삭제 — 선택된 레코드를 DB에서 완전히 제거한다."""
    app = app or current_app

    normalized: List[int] = []
    for raw in ids or []:
        try:
            num = int(raw)
        except (TypeError, ValueError):
            continue
        if num > 0 and num not in normalized:
            normalized.append(num)

    if not normalized:
        return 0

    placeholders = ','.join(['?'] * len(normalized))
    sql = f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})"

    try:
        with _get_connection(app) as conn:
            cur = conn.execute(sql, tuple(normalized))
            conn.commit()
            return int(cur.rowcount or 0)
    except Exception:
        logger.exception('Failed to delete %s rows', TABLE_NAME)
        raise


def delete_data_delete_system(system_id: int, actor_id: Any, app=None) -> bool:
    return delete_data_delete_systems([system_id], actor_id, app) > 0
