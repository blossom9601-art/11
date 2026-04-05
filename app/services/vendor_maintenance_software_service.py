import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

SOFTWARE_TABLE = 'biz_vendor_maintenance_software'
VENDOR_TABLE = 'biz_vendor_maintenance'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    """Resolve the sqlite path consistent with Flask-SQLAlchemy.

    We intentionally mirror vendor_manufacturer_service behavior so that
    sqlite:///dev_blossom.db maps to <instance_path>/dev_blossom.db on Windows.
    """

    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('VENDOR_MAINTENANCE_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'vendor_maintenance.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'vendor_maintenance.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        if normalized.startswith('/') and normalized.count('/') == 1:
            filename = normalized.lstrip('/')
            return os.path.abspath(os.path.join(app.instance_path, filename))
        return os.path.abspath(path)

    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(app.instance_path, relative))


def _legacy_resolve_db_path(app=None) -> str:
    """Legacy resolver: sqlite:///dev_blossom.db -> <project_root>/dev_blossom.db."""

    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('VENDOR_MAINTENANCE_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'vendor_maintenance.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'vendor_maintenance.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    if os.path.isabs(path):
        return os.path.abspath(path)
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
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except sqlite3.DatabaseError:
        logger.warning('Could not enable foreign key enforcement for %s', SOFTWARE_TABLE)
    return conn


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return bool(row)


def _table_row_count(conn: sqlite3.Connection, table_name: str) -> int:
    try:
        row = conn.execute(f"SELECT COUNT(1) AS cnt FROM {table_name}").fetchone()
        return int(row['cnt'] or 0) if row else 0
    except sqlite3.DatabaseError:
        return 0


def _copy_table_rows(*, src_conn: sqlite3.Connection, dst_conn: sqlite3.Connection, table_name: str) -> int:
    src_cols = [r[1] for r in src_conn.execute(f"PRAGMA table_info({table_name})").fetchall()]
    dst_cols = [r[1] for r in dst_conn.execute(f"PRAGMA table_info({table_name})").fetchall()]
    cols = [c for c in src_cols if c in dst_cols]
    if not cols:
        return 0

    col_list = ','.join(cols)
    placeholders = ','.join(['?'] * len(cols))
    rows = src_conn.execute(f"SELECT {col_list} FROM {table_name}").fetchall()
    if not rows:
        return 0

    dst_conn.executemany(
        f"INSERT OR IGNORE INTO {table_name} ({col_list}) VALUES ({placeholders})",
        [tuple(r[c] for c in cols) for r in rows],
    )
    return len(rows)


def _migrate_legacy_vendor_maintenance_software(app=None) -> None:
    app = app or current_app
    legacy_path = _legacy_resolve_db_path(app)
    new_path = _resolve_db_path(app)
    if os.path.abspath(legacy_path) == os.path.abspath(new_path):
        return
    if not os.path.exists(legacy_path):
        return

    legacy_conn: Optional[sqlite3.Connection] = None
    try:
        legacy_conn = sqlite3.connect(legacy_path)
        legacy_conn.row_factory = sqlite3.Row
        with _get_connection(app) as new_conn:
            if not _table_exists(legacy_conn, SOFTWARE_TABLE):
                return
            if not _table_exists(new_conn, SOFTWARE_TABLE):
                return
            if _table_row_count(new_conn, SOFTWARE_TABLE) > 0:
                return
            copied = _copy_table_rows(src_conn=legacy_conn, dst_conn=new_conn, table_name=SOFTWARE_TABLE)
            if copied:
                logger.info('Migrated %s rows from legacy DB for %s', copied, SOFTWARE_TABLE)
            new_conn.commit()
    except Exception:
        logger.exception('Failed legacy vendor maintenance software migration')
    finally:
        try:
            if legacy_conn is not None:
                legacy_conn.close()
        except Exception:
            pass


def init_vendor_maintenance_software_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {SOFTWARE_TABLE} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendor_id INTEGER NOT NULL,
                    contract_status TEXT,
                    category TEXT NOT NULL,
                    model TEXT NOT NULL,
                    type TEXT NOT NULL,
                    management_no TEXT,
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
                f"CREATE INDEX IF NOT EXISTS idx_{SOFTWARE_TABLE}_vendor ON {SOFTWARE_TABLE}(vendor_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{SOFTWARE_TABLE}_deleted ON {SOFTWARE_TABLE}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', SOFTWARE_TABLE)

        _migrate_legacy_vendor_maintenance_software(app)
    except Exception:
        logger.exception('Failed to initialize %s table', SOFTWARE_TABLE)
        raise


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'vendor_id': row['vendor_id'],
        'status': row['contract_status'] or '',
        'category': row['category'] or '',
        'model': row['model'] or '',
        'type': row['type'] or '',
        'mgmt_no': row['management_no'] or '',
        'serial_no': row['serial_no'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def list_vendor_maintenance_software(vendor_id: int, app=None) -> List[Dict[str, Any]]:
    app = app or current_app
    vendor_id = int(vendor_id)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT id, vendor_id, contract_status, category, model, type, management_no, serial_no, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {SOFTWARE_TABLE} WHERE vendor_id = ? AND is_deleted = 0 ORDER BY id ASC",
            (vendor_id,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def _recalc_vendor_sw_count(conn: sqlite3.Connection, vendor_id: int, *, actor: str) -> None:
    vendor_id = int(vendor_id)
    row = conn.execute(
        f"SELECT COUNT(1) AS total_cnt FROM {SOFTWARE_TABLE} WHERE vendor_id = ? AND is_deleted = 0",
        (vendor_id,),
    ).fetchone()
    total_cnt = int(row['total_cnt'] or 0) if row else 0
    ts = _now()
    conn.execute(
        f"UPDATE {VENDOR_TABLE} SET sw_count = ?, updated_at = ?, updated_by = ? WHERE id = ? AND is_deleted = 0",
        (total_cnt, ts, actor, vendor_id),
    )


def create_vendor_maintenance_software(vendor_id: int, data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    vendor_id = int(vendor_id)
    actor = (actor or 'system').strip() or 'system'

    status = (data.get('status') or '').strip() or None
    category = (data.get('category') or '').strip()
    model = (data.get('model') or '').strip()
    type_ = (data.get('type') or '').strip()
    mgmt_no = (data.get('mgmt_no') or '').strip() or None
    serial_no = (data.get('serial_no') or '').strip() or None
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
                (vendor_id, contract_status, category, model, type, management_no, serial_no, remark,
                 created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (vendor_id, status, category, model, type_, mgmt_no, serial_no, remark, ts, actor, ts, actor),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        _recalc_vendor_sw_count(conn, vendor_id, actor=actor)
        conn.commit()
        row = conn.execute(
            f"SELECT id, vendor_id, contract_status, category, model, type, management_no, serial_no, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {SOFTWARE_TABLE} WHERE id = ?",
            (new_id,),
        ).fetchone()
        return _row_to_dict(row)


def get_vendor_maintenance_software(vendor_id: int, item_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    vendor_id = int(vendor_id)
    item_id = int(item_id)
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, vendor_id, contract_status, category, model, type, management_no, serial_no, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {SOFTWARE_TABLE} WHERE vendor_id = ? AND id = ?",
            (vendor_id, item_id),
        ).fetchone()
        if not row:
            return None
        return _row_to_dict(row)


def update_vendor_maintenance_software(vendor_id: int, item_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    vendor_id = int(vendor_id)
    item_id = int(item_id)
    actor = (actor or 'system').strip() or 'system'

    updates: List[str] = []
    params: List[Any] = []

    if 'status' in data:
        status = (data.get('status') or '').strip() or None
        updates.append('contract_status = ?')
        params.append(status)

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

    if 'mgmt_no' in data:
        mgmt_no = (data.get('mgmt_no') or '').strip() or None
        updates.append('management_no = ?')
        params.append(mgmt_no)

    if 'serial_no' in data:
        serial_no = (data.get('serial_no') or '').strip() or None
        updates.append('serial_no = ?')
        params.append(serial_no)

    if 'remark' in data:
        remark = (data.get('remark') or '').strip() or None
        updates.append('remark = ?')
        params.append(remark)

    if not updates:
        return get_vendor_maintenance_software(vendor_id, item_id, app)

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
        return get_vendor_maintenance_software(vendor_id, item_id, app)


def soft_delete_vendor_maintenance_software(vendor_id: int, item_id: int, actor: str, app=None) -> bool:
    app = app or current_app
    vendor_id = int(vendor_id)
    item_id = int(item_id)
    actor = (actor or 'system').strip() or 'system'
    ts = _now()

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {SOFTWARE_TABLE} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE vendor_id = ? AND id = ? AND is_deleted = 0",
            (ts, actor, vendor_id, item_id),
        )
        if cur.rowcount == 0:
            return False
        _recalc_vendor_sw_count(conn, vendor_id, actor=actor)
        conn.commit()
        return True
