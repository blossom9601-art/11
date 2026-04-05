import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'data_delete_register'
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500
ORDERABLE_COLUMNS = {
    'id': 'id',
    'status': 'status',
    'work_date': 'work_date',
    'work_dept_code': 'work_dept_code',
    'request_dept_code': 'request_dept_code',
    'manufacturer_code': 'manufacturer_code',
    'disk_code': 'disk_code',
    'serial_number': 'serial_number',
    'success_yn': 'success_yn',
    'created_at': 'created_at',
    'updated_at': 'updated_at',
}
SEARCHABLE_COLUMNS = (
    'status',
    'work_date',
    'work_dept_code',
    'request_dept_code',
    'manufacturer_code',
    'disk_code',
    'serial_number',
    'failure_reason',
    'remark',
)
STATUS_SCOPES = {
    'register': ('대기', '진행'),
    'registers': ('대기', '진행'),
    'record': ('완료', '실패'),
    'records': ('완료', '실패'),
    'pending': ('대기',),
    'completed': ('완료',),
}


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('DATA_DELETE_REGISTER_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'data_delete_register.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'data_delete_register.db')
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


def _require_int_value(value: Any, label: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(f'{label} must be an integer')
    if number < 0:
        raise ValueError(f'{label} must be non-negative')
    return number


def _require_int(data: Dict[str, Any], key: str) -> int:
    return _require_int_value(data.get(key), key)


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


def _normalize_success_value(value: Any, *, allow_none: bool = False) -> Optional[int]:
    if value in (None, ''):
        return None if allow_none else 0
    if isinstance(value, bool):
        return 1 if value else 0
    try:
        number = int(value)
        if number in (0, 1):
            return number
    except (TypeError, ValueError):
        pass
    token = str(value).strip().lower()
    if not token:
        return None if allow_none else 0
    truthy = {'1', 't', 'true', 'y', 'yes', 'o', 'ok', 'success', '완료', '성공'}
    falsy = {'0', 'f', 'false', 'n', 'no', 'x', 'fail', 'failed', '실패'}
    if token in truthy:
        return 1
    if token in falsy:
        return 0
    raise ValueError('success_yn must be 0 or 1')


def _coerce_success_filter(value: Any) -> Optional[int]:
    try:
        return _normalize_success_value(value, allow_none=True)
    except ValueError:
        return None


def _normalize_status_filters(status: Optional[str], statuses: Optional[Iterable[str]], scope: Optional[str]) -> Tuple[str, ...]:
    collected: List[str] = []
    if status:
        token = status.strip()
        if token:
            collected.append(token)
    if statuses:
        for item in statuses:
            token = (str(item).strip())
            if token and token not in collected:
                collected.append(token)
    if scope:
        scope_values = STATUS_SCOPES.get(scope.strip().lower())
        if scope_values:
            for item in scope_values:
                if item not in collected:
                    collected.append(item)
    return tuple(collected)


def _resolve_order(order: Optional[str]) -> str:
    if not order:
        return 'work_date DESC, id DESC'
    direction = 'ASC'
    column = order
    if order.startswith('-'):
        direction = 'DESC'
        column = order[1:]
    mapped = ORDERABLE_COLUMNS.get((column or '').lower())
    if not mapped:
        return 'work_date DESC, id DESC'
    return f"{mapped} {direction}"


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    return {
        'id': row['id'],
        'status': row['status'],
        'work_date': row['work_date'],
        'work_dept_code': row['work_dept_code'],
        'worker_id': row['worker_id'],
        'request_dept_code': row['request_dept_code'],
        'requester_id': row['requester_id'],
        'manufacturer_code': row['manufacturer_code'],
        'disk_code': row['disk_code'],
        'serial_number': row['serial_number'],
        'success_yn': row['success_yn'],
        'failure_reason': row['failure_reason'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def init_data_delete_register_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT NOT NULL,
                    work_date TEXT NOT NULL,
                    work_dept_code TEXT NOT NULL,
                    worker_id INTEGER NOT NULL,
                    request_dept_code TEXT NOT NULL,
                    requester_id INTEGER NOT NULL,
                    manufacturer_code TEXT NOT NULL,
                    disk_code TEXT NOT NULL,
                    serial_number TEXT NOT NULL,
                    success_yn INTEGER NOT NULL DEFAULT 0,
                    failure_reason TEXT,
                    remark TEXT,
                    created_at TEXT NOT NULL,
                    created_by INTEGER NOT NULL,
                    updated_at TEXT,
                    updated_by INTEGER,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (work_dept_code) REFERENCES org_department(dept_code),
                    FOREIGN KEY (request_dept_code) REFERENCES org_department(dept_code),
                    FOREIGN KEY (worker_id) REFERENCES user(id),
                    FOREIGN KEY (requester_id) REFERENCES user(id),
                    FOREIGN KEY (manufacturer_code) REFERENCES biz_vendor_manufacturer(manufacturer_code),
                    FOREIGN KEY (disk_code) REFERENCES cmp_disk_type(disk_code),
                    FOREIGN KEY (created_by) REFERENCES user(id),
                    FOREIGN KEY (updated_by) REFERENCES user(id)
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(status)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_work_date ON {TABLE_NAME}(work_date)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_success ON {TABLE_NAME}(success_yn)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_live ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def get_data_delete_register(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def list_data_delete_registers(
    app=None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    statuses: Optional[Iterable[str]] = None,
    status_scope: Optional[str] = None,
    success: Optional[Any] = None,
    include_deleted: bool = False,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    order: Optional[str] = None,
) -> Dict[str, Any]:
    app = app or current_app
    clauses = ['1=1']
    params: List[Any] = []
    if not include_deleted:
        clauses.append('is_deleted = 0')
    if search:
        like = f"%{search}%"
        search_clause = ' OR '.join(f"{col} LIKE ?" for col in SEARCHABLE_COLUMNS)
        clauses.append(f'({search_clause})')
        params.extend([like] * len(SEARCHABLE_COLUMNS))
    normalized_statuses = _normalize_status_filters(status, statuses, status_scope)
    if normalized_statuses:
        placeholders = ','.join('?' for _ in normalized_statuses)
        clauses.append(f"status IN ({placeholders})")
        params.extend(normalized_statuses)
    success_filter = _coerce_success_filter(success)
    if success_filter is not None:
        clauses.append('success_yn = ?')
        params.append(success_filter)
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


def create_data_delete_register(data: Dict[str, Any], actor_id: Any, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = _normalize_actor_id(actor_id)
    payload = {
        'status': _require_text(data, 'status'),
        'work_date': _require_text(data, 'work_date'),
        'work_dept_code': _require_text(data, 'work_dept_code'),
        'worker_id': _require_int(data, 'worker_id'),
        'request_dept_code': _require_text(data, 'request_dept_code'),
        'requester_id': _require_int(data, 'requester_id'),
        'manufacturer_code': _require_text(data, 'manufacturer_code'),
        'disk_code': _require_text(data, 'disk_code'),
        'serial_number': _require_text(data, 'serial_number'),
        'success_yn': _normalize_success_value(data.get('success_yn', data.get('success'))),
        'failure_reason': _clean_text(data.get('failure_reason')),
        'remark': _clean_text(data.get('remark')),
    }
    timestamp = _now()
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                status, work_date, work_dept_code, worker_id, request_dept_code, requester_id,
                manufacturer_code, disk_code, serial_number, success_yn, failure_reason, remark,
                created_at, created_by, updated_at, updated_by, is_deleted
            ) VALUES (
                :status, :work_date, :work_dept_code, :worker_id, :request_dept_code, :requester_id,
                :manufacturer_code, :disk_code, :serial_number, :success_yn, :failure_reason, :remark,
                :created_at, :created_by, :updated_at, :updated_by, 0
            )
            """,
            {
                **payload,
                'created_at': timestamp,
                'created_by': actor,
                'updated_at': timestamp,
                'updated_by': actor,
            },
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (new_id,),
        ).fetchone()
    return _row_to_dict(row)


def update_data_delete_register(record_id: int, data: Dict[str, Any], actor_id: Any, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = _normalize_actor_id(actor_id)
    if not data:
        return get_data_delete_register(record_id, app)
    allowed_fields = {
        'status', 'work_date', 'work_dept_code', 'worker_id', 'request_dept_code', 'requester_id',
        'manufacturer_code', 'disk_code', 'serial_number', 'success_yn', 'success', 'failure_reason', 'remark'
    }
    updates: List[str] = []
    params: List[Any] = []
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (record_id,),
        ).fetchone()
        if not existing:
            return None
        for key, value in data.items():
            if key not in allowed_fields:
                continue
            if key in ('worker_id', 'requester_id'):
                updates.append(f"{key} = ?")
                params.append(_require_int_value(value, key))
            elif key in ('success_yn', 'success'):
                updates.append('success_yn = ?')
                params.append(_normalize_success_value(value, allow_none=False))
            elif key in ('status', 'work_date', 'work_dept_code', 'request_dept_code', 'manufacturer_code', 'disk_code', 'serial_number'):
                updates.append(f"{key} = ?")
                params.append(_require_text({key: value}, key))
            else:
                updates.append(f"{key} = ?")
                params.append(_clean_text(value))
        if not updates:
            return _row_to_dict(existing)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, record_id])
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row)


def delete_data_delete_register(record_id: int, actor_id: Any, app=None) -> bool:
    return delete_data_delete_registers([record_id], actor_id, app) > 0


def delete_data_delete_registers(ids: Sequence[Any], actor_id: Any, app=None) -> int:
    """물리 삭제 — 선택된 레코드를 DB에서 완전히 제거한다."""
    app = app or current_app
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    with _get_connection(app) as conn:
        cursor = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            tuple(safe_ids),
        )
        affected = cursor.rowcount or 0
        conn.commit()
        return affected
