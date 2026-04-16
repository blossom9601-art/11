import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

SOFTWARE_TABLE = 'biz_vendor_manufacturer_software'
VENDOR_TABLE = 'biz_vendor_manufacturer'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('VENDOR_MANUFACTURER_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'vendor_manufacturer.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'vendor_manufacturer.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    # Keep sqlite path resolution consistent with Flask-SQLAlchemy.
    # NOTE: urlparse yields path like "/dev_blossom.db" on Windows for sqlite:///dev_blossom.db.
    # Treat that as a filename, not an absolute filesystem path.
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
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
        logger.warning('Could not enable foreign key enforcement for %s', SOFTWARE_TABLE)
    return conn


def init_vendor_manufacturer_software_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {SOFTWARE_TABLE} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendor_id INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    model TEXT NOT NULL,
                    type TEXT NOT NULL,
                    qty INTEGER NOT NULL DEFAULT 1,
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
                f"CREATE INDEX IF NOT EXISTS idx_{SOFTWARE_TABLE}_vendor ON {SOFTWARE_TABLE}(vendor_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{SOFTWARE_TABLE}_deleted ON {SOFTWARE_TABLE}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', SOFTWARE_TABLE)
    except Exception:
        logger.exception('Failed to initialize %s table', SOFTWARE_TABLE)
        raise


def _sanitize_int(value: Any, *, default: int = 0, minimum: int = 0) -> int:
    if value in (None, ''):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if parsed < minimum:
        return minimum
    return parsed


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'vendor_id': row['vendor_id'],
        'category': row['category'] or '',
        'model': row['model'] or '',
        'type': row['type'] or '',
        'qty': row['qty'] or 0,
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def list_vendor_manufacturer_software(vendor_id: int, app=None) -> List[Dict[str, Any]]:
    app = app or current_app
    vendor_id = int(vendor_id)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT id, vendor_id, category, model, type, qty, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {SOFTWARE_TABLE} WHERE vendor_id = ? AND is_deleted = 0 ORDER BY id ASC",
            (vendor_id,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def _recalc_vendor_sw_count(conn: sqlite3.Connection, vendor_id: int, *, actor: str) -> None:
    vendor_id = int(vendor_id)
    row = conn.execute(
        f"SELECT COALESCE(SUM(qty), 0) AS total_qty FROM {SOFTWARE_TABLE} WHERE vendor_id = ? AND is_deleted = 0",
        (vendor_id,),
    ).fetchone()
    total_qty = int(row['total_qty'] or 0) if row else 0
    ts = _now()
    conn.execute(
        f"UPDATE {VENDOR_TABLE} SET sw_count = ?, updated_at = ?, updated_by = ? WHERE id = ? AND is_deleted = 0",
        (total_qty, ts, actor, vendor_id),
    )


def create_vendor_manufacturer_software(vendor_id: int, data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    vendor_id = int(vendor_id)
    actor = (actor or 'system').strip() or 'system'

    category = (data.get('category') or '').strip()
    model = (data.get('model') or '').strip()
    type_ = (data.get('type') or '').strip()
    qty = _sanitize_int(data.get('qty'), default=1, minimum=1)
    remark = (data.get('remark') or '').strip() or None

    if not category:
        raise ValueError('category is required')
    if not model:
        raise ValueError('model is required')
    if not type_:
        raise ValueError('type is required')

    ts = _now()
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {SOFTWARE_TABLE}
                (vendor_id, category, model, type, qty, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (vendor_id, category, model, type_, qty, remark, ts, actor, ts, actor),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        _recalc_vendor_sw_count(conn, vendor_id, actor=actor)
        conn.commit()
        row = conn.execute(
            f"SELECT id, vendor_id, category, model, type, qty, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {SOFTWARE_TABLE} WHERE id = ?",
            (new_id,),
        ).fetchone()
        return _row_to_dict(row)


def update_vendor_manufacturer_software(vendor_id: int, item_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    vendor_id = int(vendor_id)
    item_id = int(item_id)
    actor = (actor or 'system').strip() or 'system'

    updates: List[str] = []
    params: List[Any] = []

    if 'category' in data:
        category = (data.get('category') or '').strip()
        if not category:
            raise ValueError('category is required')
        updates.append('category = ?')
        params.append(category)

    if 'model' in data:
        model = (data.get('model') or '').strip()
        if not model:
            raise ValueError('model is required')
        updates.append('model = ?')
        params.append(model)

    if 'type' in data:
        type_ = (data.get('type') or '').strip()
        if not type_:
            raise ValueError('type is required')
        updates.append('type = ?')
        params.append(type_)

    if 'qty' in data:
        qty = _sanitize_int(data.get('qty'), default=1, minimum=1)
        updates.append('qty = ?')
        params.append(qty)

    if 'remark' in data:
        remark = (data.get('remark') or '').strip() or None
        updates.append('remark = ?')
        params.append(remark)

    if not updates:
        return get_vendor_manufacturer_software(vendor_id, item_id, app)

    ts = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([ts, actor, vendor_id, item_id])

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {SOFTWARE_TABLE} SET {', '.join(updates)} WHERE vendor_id = ? AND id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        _recalc_vendor_sw_count(conn, vendor_id, actor=actor)
        conn.commit()
        return get_vendor_manufacturer_software(vendor_id, item_id, app)


def get_vendor_manufacturer_software(vendor_id: int, item_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    vendor_id = int(vendor_id)
    item_id = int(item_id)
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, vendor_id, category, model, type, qty, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {SOFTWARE_TABLE} WHERE vendor_id = ? AND id = ?",
            (vendor_id, item_id),
        ).fetchone()
        if not row:
            return None
        return _row_to_dict(row)


def soft_delete_vendor_manufacturer_software(vendor_id: int, item_id: int, actor: str, app=None) -> bool:
    app = app or current_app
    vendor_id = int(vendor_id)
    item_id = int(item_id)
    actor = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"DELETE FROM {SOFTWARE_TABLE} WHERE vendor_id = ? AND id = ?",
            (vendor_id, item_id),
        )
        if cur.rowcount == 0:
            return False
        _recalc_vendor_sw_count(conn, vendor_id, actor=actor)
        conn.commit()
        return True
