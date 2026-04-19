import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'biz_vendor_manufacturer'
MANAGER_TABLE_NAME = 'biz_vendor_manufacturer_manager'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


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

    # Keep sqlite path resolution consistent with Flask-SQLAlchemy:
    # - For sqlite URIs like "sqlite:///dev_blossom.db", Flask resolves the file under instance_path.
    # - Our service layer should point at the same DB so FK lookups match.
    #
    # NOTE: urlparse yields path like "/dev_blossom.db" on Windows for sqlite:///dev_blossom.db.
    # Treat that as a filename, not an absolute filesystem path.
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        # Special-case "/<filename>.db" (no other slashes) as instance-relative.
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


def _sanitize_int(value: Any) -> int:
    if value in (None, ''):
        return 0
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else 0
    except (TypeError, ValueError):
        return 0


def _normalize_code(seed: str) -> str:
    base = (seed or 'MANUFACTURER').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base).strip('_') or 'MANUFACTURER'
    return base[:60]


def _normalize_name(value: Any) -> str:
    text = str(value or '').strip()
    return re.sub(r'\s+', ' ', text)


def _generate_unique_code(conn: sqlite3.Connection, seed: str) -> str:
    base = _normalize_code(seed)
    candidate = base
    counter = 1
    while True:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE manufacturer_code = ?",
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
            raise ValueError('고유 제조사 코드 생성을 실패했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE manufacturer_code = ?",
        (code,),
    ).fetchone()
    if row and (record_id is None or row['id'] != record_id):
        raise ValueError('이미 사용 중인 제조사 코드입니다.')


def _assert_unique_name(conn: sqlite3.Connection, name: str, record_id: Optional[int] = None) -> None:
    normalized_name = _normalize_name(name)
    if not normalized_name:
        raise ValueError('manufacturer_name is required')
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE is_deleted = 0 AND lower(trim(manufacturer_name)) = lower(trim(?))",
        (normalized_name,),
    ).fetchone()
    if row and (record_id is None or row['id'] != record_id):
        raise ValueError('동일한 제조사명이 이미 존재합니다.')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        'id': row['id'],
        'manufacturer_code': row['manufacturer_code'],
        'manufacturer_name': row['manufacturer_name'],
        'vendor': row['manufacturer_name'],
        'address': row['address'] or '',
        'business_number': row['business_no'] or '',
        'call_center': row['call_center'] or '',
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


def init_vendor_manufacturer_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    manufacturer_code TEXT NOT NULL UNIQUE,
                    manufacturer_name TEXT NOT NULL,
                    address TEXT,
                    business_no TEXT,
                    call_center TEXT,
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
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(manufacturer_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def init_vendor_manufacturer_manager_table(app=None) -> None:
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


def list_vendor_manufacturer_managers(vendor_id: int, *, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
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


def list_all_vendor_managers(*, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    """List managers across ALL vendors, each enriched with vendor_name."""
    app = app or current_app
    with _get_connection(app) as conn:
        where = "(m.is_deleted = 0 OR m.is_deleted IS NULL)"
        if include_deleted:
            where = "1=1"
        rows = conn.execute(
            f"""
            SELECT m.*, v.manufacturer_name AS vendor_name
            FROM {MANAGER_TABLE_NAME} m
            LEFT JOIN {TABLE_NAME} v ON v.id = m.vendor_id AND (v.is_deleted = 0 OR v.is_deleted IS NULL)
            WHERE {where}
            ORDER BY v.manufacturer_name ASC, m.name ASC
            """,
        ).fetchall()
        results = []
        for r in rows:
            d = _mgr_row_to_dict(r)
            try:
                d['vendor_name'] = r['vendor_name'] or ''
            except (IndexError, KeyError):
                d['vendor_name'] = ''
            results.append(d)
        return results


def create_vendor_manufacturer_manager(vendor_id: int, payload: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
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


def update_vendor_manufacturer_manager(vendor_id: int, manager_id: int, payload: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
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
        if val is None:
            cleaned = None
        else:
            cleaned = str(val).strip() or None
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


def soft_delete_vendor_manufacturer_manager(vendor_id: int, manager_id: int, actor: str, app=None) -> int:
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


def _table_names(conn: sqlite3.Connection) -> List[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return [row[0] for row in rows]


def _table_has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    try:
        cols = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return any((c[1] == column) for c in cols)
    except sqlite3.DatabaseError:
        return False


def backfill_vendor_manufacturers(app=None, *, actor: str = 'system') -> int:
    """Populate vendor manufacturers from existing manufacturer_code values.

    If the app previously stored manufacturer codes directly on other tables, the
    manufacturer lookup table can be empty. This makes dropdown search look
    broken because there are no options.

    This function scans all sqlite tables for a `manufacturer_code` column and
    inserts any missing codes into `biz_vendor_manufacturer`, using the code
    itself as the initial manufacturer_name.
    """

    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    inserted = 0
    timestamp = _now()

    with _get_connection(app) as conn:
        # Ensure the vendor table exists.
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                manufacturer_code TEXT NOT NULL UNIQUE,
                manufacturer_name TEXT NOT NULL,
                address TEXT,
                business_no TEXT,
                call_center TEXT,
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

        codes: List[str] = []
        for table in _table_names(conn):
            if table == TABLE_NAME:
                continue
            if not _table_has_column(conn, table, 'manufacturer_code'):
                continue
            try:
                rows = conn.execute(
                    f"SELECT DISTINCT manufacturer_code FROM {table} "
                    "WHERE manufacturer_code IS NOT NULL AND TRIM(manufacturer_code) != ''"
                ).fetchall()
                codes.extend([r[0] for r in rows if r and r[0]])
            except sqlite3.DatabaseError:
                continue

        seen = set()
        for code in codes:
            code = str(code).strip()
            if not code or code in seen:
                continue
            seen.add(code)
            cur = conn.execute(
                f"INSERT OR IGNORE INTO {TABLE_NAME} (manufacturer_code, manufacturer_name, created_at, created_by) "
                "VALUES (?, ?, ?, ?)",
                (code, code, timestamp, actor),
            )
            if cur.rowcount:
                inserted += 1

        if inserted:
            conn.commit()
            logger.info('Backfilled %s vendor manufacturers', inserted)

    return inserted


def _prepare_payload(data: Dict[str, Any], *, require_all: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    mapping = {
        'manufacturer_name': ['manufacturer_name', 'vendor'],
        'address': ['address'],
        'business_no': ['business_no', 'business_number'],
        'call_center': ['call_center'],
        'hw_count': ['hw_count', 'hardware_qty'],
        'sw_count': ['sw_count', 'software_qty'],
        'component_count': ['component_count', 'component_qty'],
        'remark': ['remark', 'note'],
        'manufacturer_code': ['manufacturer_code', 'code'],
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data[alias]
                break
    if require_all:
        missing = [key for key in ('manufacturer_name',) if not payload.get(key)]
        if missing:
            raise ValueError('필수 필드가 누락되었습니다: ' + ', '.join(missing))
    for key in ('hw_count', 'sw_count', 'component_count'):
        if key in payload:
            payload[key] = _sanitize_int(payload[key])
    return payload


def list_vendors(app=None, *, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1' if include_deleted else 'is_deleted = 0']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'manufacturer_name LIKE ?',
                'manufacturer_code LIKE ?',
                'address LIKE ?',
                'business_no LIKE ?',
                'call_center LIKE ?'
            ]) + ')')
            params.extend([like] * 5)
        query = (
            f"SELECT id, manufacturer_code, manufacturer_name, address, business_no, call_center, "
            f"hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def create_vendor(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=True)
    name = _normalize_name(payload['manufacturer_name'])
    if not name:
        raise ValueError('manufacturer_name is required')
    timestamp = _now()
    with _get_connection(app) as conn:
        _assert_unique_name(conn, name)
        code = payload.get('manufacturer_code')
        if code:
            _assert_unique_code(conn, code)
        else:
            code = _generate_unique_code(conn, name)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (manufacturer_code, manufacturer_name, address, business_no, call_center,
                 hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                code[:60],
                name,
                payload.get('address'),
                payload.get('business_no'),
                payload.get('call_center'),
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
    return get_vendor(new_id, app)


def get_vendor(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, manufacturer_code, manufacturer_name, address, business_no, call_center, "
            f"hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def get_vendor_by_code(manufacturer_code: str, app=None, *, include_deleted: bool = False) -> Optional[Dict[str, Any]]:
    app = app or current_app
    code = (manufacturer_code or '').strip()
    if not code:
        return None
    with _get_connection(app) as conn:
        clauses = ['manufacturer_code = ?']
        params: List[Any] = [code]
        if not include_deleted:
            clauses.append('is_deleted = 0')
        row = conn.execute(
            f"SELECT id, manufacturer_code, manufacturer_name, address, business_no, call_center, "
            f"hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)}",
            params,
        ).fetchone()
        return _row_to_dict(row) if row else None


def update_vendor(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=False)
    if not payload:
        return get_vendor(record_id, app)
    with _get_connection(app) as conn:
        if 'manufacturer_name' in payload:
            normalized_name = _normalize_name(payload['manufacturer_name'])
            if not normalized_name:
                raise ValueError('manufacturer_name is required')
            _assert_unique_name(conn, normalized_name, record_id)
            payload['manufacturer_name'] = normalized_name
        if 'manufacturer_code' in payload:
            code = payload['manufacturer_code']
            if code:
                _assert_unique_code(conn, code, record_id)
            else:
                del payload['manufacturer_code']
        updates: List[str] = []
        params: List[Any] = []
        for column in (
            'manufacturer_name',
            'manufacturer_code',
            'address',
            'business_no',
            'call_center',
            'hw_count',
            'sw_count',
            'component_count',
            'remark',
        ):
            if column in payload:
                value = payload[column]
                if column == 'manufacturer_name' and not value:
                    raise ValueError('manufacturer_name is required')
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            return get_vendor(record_id, app)
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
    return get_vendor(record_id, app)


def soft_delete_vendors(ids: Iterable[Any], actor: str, app=None) -> int:
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
        # soft-delete 는 manufacturer_code 를 변경하지 않으므로
        # 자식 테이블 FK 검사가 불필요함 — 일시적으로 비활성화
        conn.execute('PRAGMA foreign_keys = OFF')
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            [now, actor] + safe_ids,
        )
        conn.commit()
        conn.execute('PRAGMA foreign_keys = ON')
        return cur.rowcount
