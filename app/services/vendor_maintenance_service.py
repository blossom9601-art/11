import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'biz_vendor_maintenance'
MANAGER_TABLE_NAME = 'biz_vendor_maintenance_manager'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
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

    # Keep sqlite path resolution consistent with Flask-SQLAlchemy:
    # - For sqlite URIs like "sqlite:///dev_blossom.db", Flask resolves the file under instance_path.
    # - Our service layer should point at the same DB so related features share the same data.
    #
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


def _legacy_resolve_db_path(app=None) -> str:
    """Legacy resolver: sqlite:///dev_blossom.db -> <project_root>/dev_blossom.db.

    Historically, some vendor maintenance tables were created in the project root
    due to path resolution differences on Windows. We keep this to migrate data.
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
        logger.warning('Could not enable foreign key enforcement for %s', TABLE_NAME)
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
    """Copy rows from src -> dst using intersection of columns.

    Idempotent-ish: uses INSERT OR IGNORE.
    """

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


def _migrate_legacy_vendor_maintenance_tables(app=None) -> None:
    """Migrate vendor maintenance tables from legacy root DB into instance DB.

    Only runs when:
    - legacy DB exists and has the table
    - destination DB has the table
    - destination table is currently empty
    """

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
            for table_name in (TABLE_NAME, MANAGER_TABLE_NAME):
                if not _table_exists(legacy_conn, table_name):
                    continue
                if not _table_exists(new_conn, table_name):
                    continue
                if _table_row_count(new_conn, table_name) > 0:
                    continue
                copied = _copy_table_rows(src_conn=legacy_conn, dst_conn=new_conn, table_name=table_name)
                if copied:
                    logger.info('Migrated %s rows from legacy DB for %s', copied, table_name)
            new_conn.commit()
    except Exception:
        logger.exception('Failed legacy vendor maintenance migration')
    finally:
        try:
            if legacy_conn is not None:
                legacy_conn.close()
        except Exception:
            pass


def _sanitize_int(value: Any) -> int:
    if value in (None, ''):
        return 0
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else 0
    except (TypeError, ValueError):
        return 0


def _normalize_code(seed: str) -> str:
    base = (seed or 'MAINTENANCE').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base).strip('_') or 'MAINTENANCE'
    return base[:60]


def _generate_unique_code(conn: sqlite3.Connection, seed: str) -> str:
    base = _normalize_code(seed)
    candidate = base
    counter = 1
    while True:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE maintenance_code = ?",
            (candidate,),
        ).fetchone()
        if not row:
            return candidate
        counter += 1
        suffix = f"_{counter}"
        candidate = (
            base[:60 - len(suffix)] + suffix
            if len(base) + len(suffix) > 60
            else base + suffix
        )
        if counter > 9999:
            raise ValueError('고유 유지보수사 코드 생성을 실패했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE maintenance_code = ?",
        (code,),
    ).fetchone()
    if row and (record_id is None or row['id'] != record_id):
        raise ValueError('이미 사용 중인 유지보수사 코드입니다.')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        'id': row['id'],
        'maintenance_code': row['maintenance_code'],
        'maintenance_name': row['maintenance_name'],
        'vendor': row['maintenance_name'],
        'address': row['address'] or '',
        'business_number': row['business_no'] or '',
        'call_center': row['call_center'] or '',
        'manager_count': row['manager_count'] or 0,
        'hardware_qty': row['hw_count'] or 0,
        'software_qty': row['sw_count'] or 0,
        'component_qty': row['component_count'] or 0,
        'note': row['remark'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def init_vendor_maintenance_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    maintenance_code TEXT NOT NULL UNIQUE,
                    maintenance_name TEXT NOT NULL,
                    address TEXT,
                    business_no TEXT,
                    call_center TEXT,
                    manager_count INTEGER DEFAULT 0,
                    hw_count INTEGER DEFAULT 0,
                    sw_count INTEGER DEFAULT 0,
                    component_count INTEGER DEFAULT 0,
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
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(maintenance_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)

        _migrate_legacy_vendor_maintenance_tables(app)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def init_vendor_maintenance_manager_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {MANAGER_TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendor_id INTEGER NOT NULL,
                    org TEXT,
                    name TEXT,
                    role TEXT,
                    phone TEXT,
                    email TEXT,
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
                f"CREATE INDEX IF NOT EXISTS idx_{MANAGER_TABLE_NAME}_vendor_id ON {MANAGER_TABLE_NAME}(vendor_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{MANAGER_TABLE_NAME}_deleted ON {MANAGER_TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{MANAGER_TABLE_NAME}_name ON {MANAGER_TABLE_NAME}(name)"
            )
            # ------ migration: add is_primary column if missing ------
            try:
                cols = [c[1] for c in conn.execute(f"PRAGMA table_info({MANAGER_TABLE_NAME})").fetchall()]
                if 'is_primary' not in cols:
                    conn.execute(f"ALTER TABLE {MANAGER_TABLE_NAME} ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0")
                    logger.info('Added is_primary column to %s', MANAGER_TABLE_NAME)
            except Exception as _mig_err:
                logger.warning('is_primary migration skipped for %s: %s', MANAGER_TABLE_NAME, _mig_err)
            conn.commit()
            logger.info('%s table ready', MANAGER_TABLE_NAME)

        _migrate_legacy_vendor_maintenance_tables(app)
    except Exception:
        logger.exception('Failed to initialize %s table', MANAGER_TABLE_NAME)
        raise


def _mgr_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    d = {
        'id': row['id'],
        'vendor_id': row['vendor_id'],
        'org': row['org'] or '',
        'name': row['name'] or '',
        'role': row['role'] or '',
        'phone': row['phone'] or '',
        'email': row['email'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }
    try:
        d['is_primary'] = bool(row['is_primary']) if row['is_primary'] else False
    except (IndexError, KeyError):
        d['is_primary'] = False
    return d


def list_vendor_maintenance_managers(app=None, *, vendor_id: int, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    vendor_id = _sanitize_int(vendor_id)
    if vendor_id <= 0:
        return []
    with _get_connection(app) as conn:
        where = "vendor_id = ?"
        params: List[Any] = [vendor_id]
        if not include_deleted:
            where += " AND (is_deleted = 0 OR is_deleted IS NULL)"
        rows = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE {where} ORDER BY id ASC",
            tuple(params),
        ).fetchall()
        return [_mgr_row_to_dict(r) for r in rows]


def create_vendor_maintenance_manager(app=None, *, vendor_id: int, payload: Dict[str, Any], actor: str) -> Dict[str, Any]:
    app = app or current_app
    vendor_id = _sanitize_int(vendor_id)
    if vendor_id <= 0:
        raise ValueError('vendor_id가 올바르지 않습니다.')
    actor = (actor or 'system').strip() or 'system'
    now = _now()

    org = (payload.get('org') or '').strip() or None
    name = (payload.get('name') or '').strip() or None
    role = (payload.get('role') or '').strip() or None
    phone = (payload.get('phone') or '').strip() or None
    email = (payload.get('email') or '').strip() or None
    remark = (payload.get('remark') or '').strip() or None
    is_primary = 1 if payload.get('is_primary') else 0

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {MANAGER_TABLE_NAME}
              (vendor_id, org, name, role, phone, email, remark, is_primary, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (vendor_id, org, name, role, phone, email, remark, is_primary, now, actor, now, actor),
        )
        conn.commit()
        manager_id = int(cur.lastrowid)
        row = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE id = ?",
            (manager_id,),
        ).fetchone()
        return _mgr_row_to_dict(row)


def update_vendor_maintenance_manager(app=None, *, vendor_id: int, manager_id: int, payload: Dict[str, Any], actor: str) -> Optional[Dict[str, Any]]:
    app = app or current_app
    vendor_id = _sanitize_int(vendor_id)
    manager_id = _sanitize_int(manager_id)
    if vendor_id <= 0 or manager_id <= 0:
        return None
    actor = (actor or 'system').strip() or 'system'
    now = _now()

    fields: List[str] = []
    values: List[Any] = []
    for key in ('org', 'name', 'role', 'phone', 'email', 'remark'):
        if key not in payload:
            continue
        val = payload.get(key)
        cleaned = None if val is None else (str(val).strip() or None)
        fields.append(f"{key} = ?")
        values.append(cleaned)
    if 'is_primary' in payload:
        fields.append('is_primary = ?')
        values.append(1 if payload['is_primary'] else 0)

    fields.append('updated_at = ?')
    values.append(now)
    fields.append('updated_by = ?')
    values.append(actor)

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE id = ? AND vendor_id = ?",
            (manager_id, vendor_id),
        ).fetchone()
        if not existing or int(existing['is_deleted'] or 0) != 0:
            return None

        conn.execute(
            f"UPDATE {MANAGER_TABLE_NAME} SET {', '.join(fields)} WHERE id = ? AND vendor_id = ?",
            tuple(values + [manager_id, vendor_id]),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE id = ?",
            (manager_id,),
        ).fetchone()
        return _mgr_row_to_dict(row)


def soft_delete_vendor_maintenance_manager(app=None, *, vendor_id: int, manager_id: int, actor: str) -> int:
    app = app or current_app
    vendor_id = _sanitize_int(vendor_id)
    manager_id = _sanitize_int(manager_id)
    if vendor_id <= 0 or manager_id <= 0:
        return 0
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"DELETE FROM {MANAGER_TABLE_NAME} WHERE id = ? AND vendor_id = ?",
            (manager_id, vendor_id),
        )
        conn.commit()
        return int(cur.rowcount or 0)


def _prepare_payload(data: Dict[str, Any], *, require_all: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    mapping = {
        'maintenance_name': ['maintenance_name', 'vendor', 'name'],
        'address': ['address'],
        'business_no': ['business_no', 'business_number'],
        'call_center': ['call_center'],
        'manager_count': ['manager_count'],
        'hw_count': ['hw_count', 'hardware_qty'],
        'sw_count': ['sw_count', 'software_qty'],
        'component_count': ['component_count', 'component_qty'],
        'remark': ['remark', 'note'],
        'maintenance_code': ['maintenance_code', 'code'],
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data[alias]
                break
    if require_all:
        missing = [key for key in ('maintenance_name',) if not payload.get(key)]
        if missing:
            raise ValueError('필수 필드가 누락되었습니다: ' + ', '.join(missing))
    for key in ('manager_count', 'hw_count', 'sw_count', 'component_count'):
        if key in payload:
            payload[key] = _sanitize_int(payload[key])
    return payload


def _normalize_id_list(values: Iterable[Any]) -> List[int]:
    if not values:
        return []
    normalized: List[int] = []
    for value in values:
        if value in (None, ''):
            continue
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if number <= 0:
            continue
        normalized.append(number)
    if not normalized:
        return []
    # Remove duplicates but keep deterministic ordering for tests/logs
    return sorted(set(normalized))


def list_maintenance_vendors(app=None, *, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1' if include_deleted else 'is_deleted = 0']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'maintenance_name LIKE ?',
                'maintenance_code LIKE ?',
                'address LIKE ?',
                'business_no LIKE ?',
                'call_center LIKE ?'
            ]) + ')')
            params.extend([like] * 5)
        query = (
            f"SELECT id, maintenance_code, maintenance_name, address, business_no, call_center, "
            f"manager_count, hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_maintenance_vendors_by_ids(ids: Iterable[Any], app=None) -> Dict[int, Dict[str, Any]]:
    """Return vendor rows keyed by id for the provided iterable of ids."""
    sanitized_ids = _normalize_id_list(ids)
    if not sanitized_ids:
        return {}
    placeholders = ','.join(['?'] * len(sanitized_ids))
    query = (
        f"SELECT id, maintenance_code, maintenance_name, address, business_no, call_center, "
        f"manager_count, hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
        f"FROM {TABLE_NAME} WHERE id IN ({placeholders})"
    )
    app = app or current_app
    with _get_connection(app) as conn:
        rows = conn.execute(query, sanitized_ids).fetchall()
    return {row['id']: _row_to_dict(row) for row in rows}


def create_maintenance_vendor(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=True)
    name = payload['maintenance_name'].strip()
    if not name:
        raise ValueError('maintenance_name is required')
    timestamp = _now()
    with _get_connection(app) as conn:
        code = payload.get('maintenance_code')
        if code:
            _assert_unique_code(conn, code)
        else:
            code = _generate_unique_code(conn, name)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (maintenance_code, maintenance_name, address, business_no, call_center,
                 manager_count, hw_count, sw_count, component_count, remark,
                 created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                code[:60],
                name,
                payload.get('address'),
                payload.get('business_no'),
                payload.get('call_center'),
                payload.get('manager_count', 0),
                payload.get('hw_count', 0),
                payload.get('sw_count', 0),
                payload.get('component_count', 0),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return get_maintenance_vendor(new_id, app)


def get_maintenance_vendor(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, maintenance_code, maintenance_name, address, business_no, call_center, manager_count, "
            f"hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def update_maintenance_vendor(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=False)
    if not payload:
        return get_maintenance_vendor(record_id, app)
    with _get_connection(app) as conn:
        if 'maintenance_code' in payload:
            code = payload['maintenance_code']
            if code:
                _assert_unique_code(conn, code, record_id)
            else:
                del payload['maintenance_code']
        updates: List[str] = []
        params: List[Any] = []
        for column in (
            'maintenance_name',
            'maintenance_code',
            'address',
            'business_no',
            'call_center',
            'manager_count',
            'hw_count',
            'sw_count',
            'component_count',
            'remark',
        ):
            if column in payload:
                value = payload[column]
                if column == 'maintenance_name' and not value:
                    raise ValueError('maintenance_name is required')
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            return get_maintenance_vendor(record_id, app)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, record_id])
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return get_maintenance_vendor(record_id, app)


def soft_delete_maintenance_vendors(ids: Iterable[Any], actor: str, app=None) -> int:
    app = app or current_app
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
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            [now, actor] + safe_ids,
        )
        conn.commit()
        return cur.rowcount
