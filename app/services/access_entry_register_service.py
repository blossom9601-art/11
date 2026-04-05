import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'access_entry_register'
ORDERABLE_COLUMNS = {
    'id': 'id',
    'status': 'status',
    'name': 'name',
    'entry_datetime': 'entry_datetime',
    'exit_datetime': 'exit_datetime',
    'created_at': 'created_at',
    'updated_at': 'updated_at',
}
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500
SEARCHABLE_COLUMNS = (
    'status',
    'person_type',
    'name',
    'affiliation',
    'id_number',
    'entry_purpose',
    'entry_area',
    'work_management_dept',
    'work_assignee',
    'access_management_dept',
    'access_assignee',
    'manager_in_charge',
    'access_admin',
    'in_out_type',
    'goods_type',
    'goods_item',
    'note',
)
STATUS_SCOPES = {
    'register': ('입실', '대기'),
    'registers': ('입실', '대기'),
    'record': ('퇴실',),
    'records': ('퇴실',),
    'waiting': ('대기',),
    'enter': ('입실',),
}


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('ACCESS_ENTRY_REGISTER_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'access_entry_register.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'access_entry_register.db')
    if netloc and netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    path = path.lstrip('/')
    if os.path.isabs(path):
        return path
    return os.path.abspath(os.path.join(_project_root(app), path))


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


def _sanitize_qty(value: Any) -> Optional[int]:
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('goods_qty must be an integer') from exc


def _clean_text(value: Any) -> Optional[str]:
    text = (str(value).strip() if value is not None else '')
    return text or None


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}

    keys = set(row.keys()) if hasattr(row, 'keys') else set()
    def get(key: str, default: Any = '') -> Any:
        if key not in keys:
            return default
        return row[key]

    return {
        'id': get('id'),
        'status': get('status'),
        'person_type': get('person_type') or '',
        'name': get('name'),
        'affiliation': get('affiliation') or '',
        'id_number': get('id_number') or '',
        'entry_datetime': get('entry_datetime') or '',
        'exit_datetime': get('exit_datetime') or '',
        'entry_purpose': get('entry_purpose') or '',
        'entry_area': get('entry_area') or '',
        'laptop_use': get('laptop_use') or '',
        'usb_lock_use': get('usb_lock_use') or '',
        'work_management_dept': get('work_management_dept') or '',
        'work_assignee': get('work_assignee') or '',
        'access_management_dept': get('access_management_dept') or '',
        'access_assignee': get('access_assignee') or '',
        # legacy fields (kept for backward compatibility)
        'manager_in_charge': get('manager_in_charge') or '',
        'access_admin': get('access_admin') or '',
        'in_out_type': get('in_out_type') or '',
        'goods_type': get('goods_type') or '',
        'goods_item': get('goods_item') or '',
        'goods_qty': get('goods_qty'),
        'note': get('note') or '',
        'created_at': get('created_at'),
        'created_by': get('created_by') or '',
        'updated_at': get('updated_at'),
        'updated_by': get('updated_by') or '',
        'is_deleted': get('is_deleted', 0),
    }


def _ensure_columns(conn: sqlite3.Connection, columns: Dict[str, str]) -> None:
    existing = {row['name'] for row in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
    for name, decl in columns.items():
        if name in existing:
            continue
        conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {name} {decl}")


def init_access_entry_register_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT NOT NULL,
                    person_type TEXT,
                    name TEXT NOT NULL,
                    affiliation TEXT,
                    id_number TEXT,
                    entry_datetime TEXT NOT NULL,
                    exit_datetime TEXT,
                    entry_purpose TEXT,
                    entry_area TEXT,
                    laptop_use TEXT,
                    usb_lock_use TEXT,
                    work_management_dept TEXT,
                    work_assignee TEXT,
                    access_management_dept TEXT,
                    access_assignee TEXT,
                    manager_in_charge TEXT,
                    access_admin TEXT,
                    in_out_type TEXT,
                    goods_type TEXT,
                    goods_item TEXT,
                    goods_qty INTEGER,
                    note TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT NOT NULL,
                    updated_at TEXT,
                    updated_by TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )

            # Backfill schema for existing DBs (SQLite has no strict migrations here)
            _ensure_columns(
                conn,
                {
                    'person_type': 'TEXT',
                    'work_management_dept': 'TEXT',
                    'work_assignee': 'TEXT',
                    'access_management_dept': 'TEXT',
                    'access_assignee': 'TEXT',
                },
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(status)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_entry_dt ON {TABLE_NAME}(entry_datetime)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_live ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def get_access_entry_register(entry_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (entry_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def _resolve_order(order: Optional[str]) -> str:
    if not order:
        return 'entry_datetime DESC, id DESC'
    direction = 'ASC'
    column = order
    if order.startswith('-'):
        direction = 'DESC'
        column = order[1:]
    key = ORDERABLE_COLUMNS.get((column or '').lower())
    if not key:
        return 'entry_datetime DESC, id DESC'
    return f"{key} {direction}"


def _normalize_statuses(status: Optional[str], statuses: Optional[Iterable[str]], scope: Optional[str]) -> Tuple[str, ...]:
    values: List[str] = []
    if status:
        values.append(status.strip())
    if statuses:
        for item in statuses:
            token = (str(item).strip())
            if token:
                values.append(token)
    if not values and scope:
        scope_values = STATUS_SCOPES.get(scope.strip().lower())
        if scope_values:
            values.extend(scope_values)
    normalized = []
    for val in values:
        if val and val not in normalized:
            normalized.append(val)
    return tuple(normalized)


def list_access_entry_registers(
    app=None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    statuses: Optional[Iterable[str]] = None,
    status_scope: Optional[str] = None,
    include_deleted: bool = False,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    order: Optional[str] = None,
) -> Dict[str, Any]:
    app = app or current_app
    clauses = ['1=1']
    params: List[Any] = []
    if not include_deleted:
        clauses.append('is_deleted = 0')
    search_token = (search or '').strip()
    if search_token:
        like = f"%{search_token}%"
        or_clause = ' OR '.join(f"{col} LIKE ?" for col in SEARCHABLE_COLUMNS)
        clauses.append(f'({or_clause})')
        params.extend([like] * len(SEARCHABLE_COLUMNS))
    status_filters = _normalize_statuses(status, statuses, status_scope)
    if status_filters:
        placeholders = ','.join('?' for _ in status_filters)
        clauses.append(f"status IN ({placeholders})")
        params.extend(status_filters)
    where_sql = ' AND '.join(clauses)
    order_sql = _resolve_order(order)
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
            (*params, page_size, offset),
        ).fetchall()
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE {where_sql}",
            params,
        ).fetchone()[0]
    return {
        'items': [_row_to_dict(row) for row in rows],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def _require_text(data: Dict[str, Any], key: str, fallback: Optional[str] = None) -> str:
    value = (data.get(key) or '').strip()
    if value:
        return value
    if fallback:
        return fallback
    raise ValueError(f'{key} is required')


def create_access_entry_register(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    init_access_entry_register_table(app)
    actor = (actor or 'system').strip() or 'system'
    status_val = _require_text(data, 'status', fallback='입실')
    name_val = _require_text(data, 'name')
    entry_dt = (data.get('entry_datetime') or '').strip() or _now()
    payload = {
        'status': status_val,
        'person_type': _clean_text(data.get('person_type')),
        'name': name_val,
        'affiliation': _clean_text(data.get('affiliation')),
        'id_number': _clean_text(data.get('id_number')),
        'entry_datetime': entry_dt,
        'exit_datetime': _clean_text(data.get('exit_datetime')),
        'entry_purpose': _clean_text(data.get('entry_purpose')),
        'entry_area': _clean_text(data.get('entry_area')),
        'laptop_use': _clean_text(data.get('laptop_use')),
        'usb_lock_use': _clean_text(data.get('usb_lock_use')),
        'work_management_dept': _clean_text(data.get('work_management_dept')),
        'work_assignee': _clean_text(data.get('work_assignee')),
        'access_management_dept': _clean_text(data.get('access_management_dept')),
        'access_assignee': _clean_text(data.get('access_assignee')),
        'manager_in_charge': _clean_text(data.get('manager_in_charge')),
        'access_admin': _clean_text(data.get('access_admin')),
        'in_out_type': _clean_text(data.get('in_out_type')),
        'goods_type': _clean_text(data.get('goods_type')),
        'goods_item': _clean_text(data.get('goods_item')),
        'goods_qty': _sanitize_qty(data.get('goods_qty')),
        'note': _clean_text(data.get('note')),
    }
    timestamp = _now()
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                status, person_type, name, affiliation, id_number, entry_datetime, exit_datetime,
                entry_purpose, entry_area, laptop_use, usb_lock_use,
                work_management_dept, work_assignee, access_management_dept, access_assignee,
                manager_in_charge, access_admin, in_out_type, goods_type, goods_item, goods_qty, note,
                created_at, created_by, updated_at, updated_by, is_deleted
            ) VALUES (
                :status, :person_type, :name, :affiliation, :id_number, :entry_datetime, :exit_datetime,
                :entry_purpose, :entry_area, :laptop_use, :usb_lock_use,
                :work_management_dept, :work_assignee, :access_management_dept, :access_assignee,
                :manager_in_charge, :access_admin, :in_out_type, :goods_type, :goods_item, :goods_qty, :note,
                :created_at, :created_by, :updated_at, :updated_by, 0
            )
            """,
            {**payload, 'created_at': timestamp, 'created_by': actor, 'updated_at': timestamp, 'updated_by': actor},
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (new_id,),
        ).fetchone()
    return _row_to_dict(row)


def update_access_entry_register(entry_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    init_access_entry_register_table(app)
    actor = (actor or 'system').strip() or 'system'
    if not data:
        return get_access_entry_register(entry_id, app)
    allowed_keys = {
        'status', 'person_type', 'name', 'affiliation', 'id_number', 'entry_datetime', 'exit_datetime',
        'entry_purpose', 'entry_area', 'laptop_use', 'usb_lock_use', 'manager_in_charge',
        'access_admin',
        'work_management_dept', 'work_assignee', 'access_management_dept', 'access_assignee',
        'in_out_type', 'goods_type', 'goods_item', 'goods_qty', 'note'
    }
    updates: List[str] = []
    params: List[Any] = []
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (entry_id,),
        ).fetchone()
        if not existing:
            return None
        for key, value in data.items():
            if key not in allowed_keys:
                continue
            if key == 'goods_qty':
                updates.append('goods_qty = ?')
                params.append(_sanitize_qty(value))
            elif key in ('status', 'name', 'entry_datetime'):
                text_value = (value or '').strip()
                if not text_value:
                    raise ValueError(f'{key} cannot be blank')
                updates.append(f'{key} = ?')
                params.append(text_value)
            else:
                updates.append(f'{key} = ?')
                params.append(_clean_text(value))
        if not updates:
            return _row_to_dict(existing)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, entry_id])
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (entry_id,),
        ).fetchone()
        return _row_to_dict(row)


def delete_access_entry_register(entry_id: int, actor: str, app=None) -> bool:
    return delete_access_entry_registers([entry_id], actor, app) > 0


def delete_access_entry_registers(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    timestamp = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders}) AND is_deleted = 0",
            [timestamp, actor, *safe_ids],
        )
        conn.commit()
        return cur.rowcount
