import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'biz_vendor_component'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _resolve_db_path(app=None) -> str:
    """Resolve the sqlite path consistent with Flask-SQLAlchemy.

    We intentionally mirror vendor_manufacturer_service behavior so that
    sqlite:///dev_blossom.db maps to <instance_path>/dev_blossom.db on Windows.
    """

    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('VENDOR_COMPONENT_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'vendor_component.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'vendor_component.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        # Special-case "/<filename>.db" as instance-relative on Windows.
        if normalized.startswith('/') and normalized.count('/') == 1:
            filename = normalized.lstrip('/')
            return os.path.abspath(os.path.join(app.instance_path, filename))
        return os.path.abspath(path)

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
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except sqlite3.DatabaseError:
        logger.warning('Could not enable foreign key enforcement for %s', TABLE_NAME)
    return conn


def _sanitize_int(value: Any, *, default: int = 0) -> int:
    if value in (None, ''):
        return default
    try:
        parsed = int(value)
        return parsed
    except (TypeError, ValueError):
        return default


def _normalize_vendor_kind(value: Any) -> str:
    raw = (str(value or '').strip().lower())
    if raw in ('manufacturer', 'm', 'vendor-manufacturer', 'vendor_manufacturer'):
        return 'manufacturer'
    if raw in ('maintenance', 'maint', 'vendor-maintenance', 'vendor_maintenance'):
        return 'maintenance'
    raise ValueError('vendor_kind는 manufacturer 또는 maintenance 여야 합니다.')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'vendor_kind': row['vendor_kind'],
        'vendor_id': row['vendor_id'],
        'status': row['status'] or '',
        'category': row['category'] or '',
        'model': row['model'] or '',
        'type': row['type'] or '',
        'qty': row['qty'],
        'mgmt_no': row['mgmt_no'] or '',
        'serial_no': row['serial_no'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def init_vendor_component_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendor_kind TEXT NOT NULL,
                    vendor_id INTEGER NOT NULL,
                    status TEXT,
                    category TEXT,
                    model TEXT NOT NULL,
                    type TEXT,
                    qty INTEGER,
                    mgmt_no TEXT,
                    serial_no TEXT,
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
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_vendor ON {TABLE_NAME}(vendor_kind, vendor_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def list_vendor_components(*, vendor_kind: str, vendor_id: int, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    vendor_kind = _normalize_vendor_kind(vendor_kind)
    vendor_id = _sanitize_int(vendor_id)
    if vendor_id <= 0:
        raise ValueError('vendor_id가 올바르지 않습니다.')

    where_deleted = '' if include_deleted else 'AND is_deleted = 0'
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"""
            SELECT *
            FROM {TABLE_NAME}
            WHERE vendor_kind = ? AND vendor_id = ?
            {where_deleted}
            ORDER BY id ASC
            """,
            (vendor_kind, vendor_id),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def _recalc_vendor_component_count(conn: sqlite3.Connection, *, vendor_kind: str, vendor_id: int) -> None:
    # Keep the vendor list page counters consistent with the detail tab data.
    # Manufacturer: sum(qty), Maintenance: count(rows) (UI has no qty column)
    if vendor_kind == 'manufacturer':
        row = conn.execute(
            f"""
            SELECT COALESCE(SUM(COALESCE(qty, 0)), 0) AS total
            FROM {TABLE_NAME}
            WHERE vendor_kind = ? AND vendor_id = ? AND is_deleted = 0
            """,
            (vendor_kind, vendor_id),
        ).fetchone()
        total = int(row['total'] or 0) if row else 0
        conn.execute(
            "UPDATE biz_vendor_manufacturer SET component_count = ? WHERE id = ?",
            (total, vendor_id),
        )
    else:
        row = conn.execute(
            f"""
            SELECT COUNT(1) AS total
            FROM {TABLE_NAME}
            WHERE vendor_kind = ? AND vendor_id = ? AND is_deleted = 0
            """,
            (vendor_kind, vendor_id),
        ).fetchone()
        total = int(row['total'] or 0) if row else 0
        conn.execute(
            "UPDATE biz_vendor_maintenance SET component_count = ? WHERE id = ?",
            (total, vendor_id),
        )


def create_vendor_component(payload: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    actor = (actor or 'system').strip() or 'system'
    vendor_kind = _normalize_vendor_kind(payload.get('vendor_kind'))
    vendor_id = _sanitize_int(payload.get('vendor_id'))
    if vendor_id <= 0:
        raise ValueError('vendor_id가 올바르지 않습니다.')

    category = (payload.get('category') or '').strip() or None
    model = (payload.get('model') or '').strip()
    if not model:
        raise ValueError('model은 필수입니다.')

    status = (payload.get('status') or '').strip() or None
    type_ = (payload.get('type') or '').strip() or None
    remark = (payload.get('remark') or '').strip() or None
    mgmt_no = (payload.get('mgmt_no') or '').strip() or None
    serial_no = (payload.get('serial_no') or '').strip() or None

    qty: Optional[int]
    if vendor_kind == 'manufacturer':
        qty = _sanitize_int(payload.get('qty'), default=1)
        if qty < 1:
            raise ValueError('qty는 1 이상이어야 합니다.')
    else:
        # Maintenance UI does not expose qty; keep NULL so it is not misleading.
        qty = None

    timestamp = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                vendor_kind, vendor_id,
                status, category, model, type, qty,
                mgmt_no, serial_no, remark,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                vendor_kind,
                vendor_id,
                status,
                category,
                model,
                type_,
                qty,
                mgmt_no,
                serial_no,
                remark,
                timestamp,
                actor,
            ),
        )
        new_id = int(cur.lastrowid)
        _recalc_vendor_component_count(conn, vendor_kind=vendor_kind, vendor_id=vendor_id)
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (new_id,)).fetchone()
        conn.commit()
        return _row_to_dict(row)


def update_vendor_component(component_id: int, payload: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    actor = (actor or 'system').strip() or 'system'
    component_id = _sanitize_int(component_id)
    if component_id <= 0:
        return None

    timestamp = _now()
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (component_id,),
        ).fetchone()
        if not existing:
            return None

        vendor_kind = _normalize_vendor_kind(payload.get('vendor_kind') or existing['vendor_kind'])
        vendor_id = _sanitize_int(payload.get('vendor_id') or existing['vendor_id'])
        if vendor_id <= 0:
            raise ValueError('vendor_id가 올바르지 않습니다.')

        status = payload.get('status', existing['status'])
        category = payload.get('category', existing['category'])
        model = payload.get('model', existing['model'])
        type_ = payload.get('type', existing['type'])
        qty = payload.get('qty', existing['qty'])
        mgmt_no = payload.get('mgmt_no', existing['mgmt_no'])
        serial_no = payload.get('serial_no', existing['serial_no'])
        remark = payload.get('remark', existing['remark'])

        model = (model or '').strip()
        if not model:
            raise ValueError('model은 필수입니다.')

        status = (status or '').strip() or None
        category = (category or '').strip() or None
        type_ = (type_ or '').strip() or None
        mgmt_no = (mgmt_no or '').strip() or None
        serial_no = (serial_no or '').strip() or None
        remark = (remark or '').strip() or None

        if vendor_kind == 'manufacturer':
            qty_norm = _sanitize_int(qty, default=1)
            if qty_norm < 1:
                raise ValueError('qty는 1 이상이어야 합니다.')
            qty_db: Optional[int] = qty_norm
        else:
            qty_db = None

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET
                vendor_kind = ?,
                vendor_id = ?,
                status = ?,
                category = ?,
                model = ?,
                type = ?,
                qty = ?,
                mgmt_no = ?,
                serial_no = ?,
                remark = ?,
                updated_at = ?,
                updated_by = ?
            WHERE id = ?
            """,
            (
                vendor_kind,
                vendor_id,
                status,
                category,
                model,
                type_,
                qty_db,
                mgmt_no,
                serial_no,
                remark,
                timestamp,
                actor,
                component_id,
            ),
        )
        _recalc_vendor_component_count(conn, vendor_kind=vendor_kind, vendor_id=vendor_id)
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (component_id,)).fetchone()
        conn.commit()
        return _row_to_dict(row)


def delete_vendor_component(component_id: int, *, actor: str, app=None) -> bool:
    actor = (actor or 'system').strip() or 'system'
    component_id = _sanitize_int(component_id)
    if component_id <= 0:
        return False

    timestamp = _now()
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT vendor_kind, vendor_id FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (component_id,),
        ).fetchone()
        if not existing:
            return False

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET is_deleted = 1,
                updated_at = ?,
                updated_by = ?
            WHERE id = ?
            """,
            (timestamp, actor, component_id),
        )
        _recalc_vendor_component_count(conn, vendor_kind=existing['vendor_kind'], vendor_id=int(existing['vendor_id']))
        conn.commit()
        return True
