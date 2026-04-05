import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'cost_contract_tab61'
VALID_SCOPES = {'OPEX', 'CAPEX'}
VALID_TYPES = {'HW', 'SW', 'ETC'}


_DESIRED_COLUMNS = [
    ('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
    ('scope', 'TEXT NOT NULL'),
    ('cost_type', 'TEXT NOT NULL'),
    ('contract_id', 'INTEGER NOT NULL DEFAULT 0'),
    ('year', 'INTEGER NOT NULL'),
    ('contract_status', 'TEXT'),
    ('work_name', 'TEXT'),
    ('system_name', 'TEXT'),
    ('contract_type', 'TEXT'),
    ('contract_vendor', 'TEXT'),
    ('contract_model', 'TEXT'),
    ('contract_qty', 'INTEGER'),
    ('contract_serial', 'TEXT'),
    ('m01', 'INTEGER'),
    ('m02', 'INTEGER'),
    ('m03', 'INTEGER'),
    ('m04', 'INTEGER'),
    ('m05', 'INTEGER'),
    ('m06', 'INTEGER'),
    ('m07', 'INTEGER'),
    ('m08', 'INTEGER'),
    ('m09', 'INTEGER'),
    ('m10', 'INTEGER'),
    ('m11', 'INTEGER'),
    ('m12', 'INTEGER'),
    ('description', 'TEXT'),
    ('created_at', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'),
    ('created_by', 'TEXT'),
    ('updated_at', 'TEXT'),
    ('updated_by', 'TEXT'),
    ('is_deleted', 'INTEGER NOT NULL DEFAULT 0'),
]


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _auto_expire_contract_status(*, year: int, months: Dict[str, Optional[int]], current_status: str) -> str:
    """Auto-set contract_status to '만료' when costs stop before the current month.

    Rule (requested): if costs exist only through June and today is in July (same year),
    status should automatically become '만료'. We do not override '해지'.
    """

    status = (current_status or '').strip()
    if status == '해지':
        return status

    try:
        last_month = 0
        for i in range(1, 13):
            v = months.get(f"m{i:02d}")
            try:
                n = int(v) if v is not None else 0
            except (TypeError, ValueError):
                n = 0
            if n > 0:
                last_month = i

        if last_month <= 0:
            return status

        now = datetime.now()
        if int(year) == now.year and now.month > last_month:
            return '만료'
    except Exception:
        return status

    return status


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _legacy_repo_db_path(app) -> str:
    """Legacy location for sqlite:///dev_blossom.db.

    Historically some services treated sqlite relative paths as repo-root relative.
    Flask-SQLAlchemy resolves those under instance_path, so we migrate on demand.
    """

    try:
        return os.path.abspath(os.path.join(_project_root(app), 'dev_blossom.db'))
    except Exception:
        return os.path.abspath('dev_blossom.db')


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dev_blossom.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    if netloc and netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    # Keep sqlite path resolution consistent with Flask-SQLAlchemy:
    # - For sqlite URIs like "sqlite:///dev_blossom.db", Flask resolves the file under instance_path.
    # - urlparse yields path like "/dev_blossom.db" on Windows for sqlite:///dev_blossom.db.
    #   Treat that as a filename, not an absolute filesystem path.
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        if normalized.startswith('/') and normalized.count('/') == 1:
            filename = normalized.lstrip('/')
            return os.path.abspath(os.path.join(app.instance_path, filename))
        return os.path.abspath(path)

    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(app.instance_path, relative))


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
            (table_name,),
        ).fetchone()
        return bool(row)
    except sqlite3.DatabaseError:
        return False


def _maybe_migrate_from_legacy_repo_db(app) -> None:
    """One-time migration: repo-root dev_blossom.db -> instance dev_blossom.db for tab61.

    Only migrates when:
    - target DB has the tab61 table but has 0 rows
    - legacy DB exists and has the tab61 table with >=1 rows
    """

    try:
        if app.config.get('_TAB61_MIGRATED_FROM_LEGACY') is True:
            return
        app.config['_TAB61_MIGRATED_FROM_LEGACY'] = True

        target_path = _resolve_db_path(app)
        legacy_path = _legacy_repo_db_path(app)
        if not legacy_path or not os.path.exists(legacy_path):
            return
        if os.path.abspath(target_path) == os.path.abspath(legacy_path):
            return

        with sqlite3.connect(target_path) as target_conn, sqlite3.connect(legacy_path) as legacy_conn:
            target_conn.row_factory = sqlite3.Row
            legacy_conn.row_factory = sqlite3.Row

            if not _table_exists(legacy_conn, TABLE_NAME):
                return

            # Ensure target schema exists before migrating.
            _ensure_tab61_schema(target_conn)

            if not _table_exists(target_conn, TABLE_NAME):
                return

            target_count = target_conn.execute(f"SELECT COUNT(*) AS c FROM {TABLE_NAME}").fetchone()['c']
            if int(target_count or 0) > 0:
                return

            legacy_count = legacy_conn.execute(f"SELECT COUNT(*) AS c FROM {TABLE_NAME}").fetchone()['c']
            if int(legacy_count or 0) <= 0:
                return

            rows = legacy_conn.execute(f"SELECT * FROM {TABLE_NAME} ORDER BY id ASC").fetchall()
            if not rows:
                return

            cols = [d[1] for d in legacy_conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()]
            if not cols:
                return

            placeholders = ','.join(['?'] * len(cols))
            col_list = ','.join(cols)
            target_conn.executemany(
                f"INSERT INTO {TABLE_NAME} ({col_list}) VALUES ({placeholders})",
                [tuple(r[c] for c in cols) for r in rows],
            )
            target_conn.commit()
    except Exception:
        logger.exception('Failed to migrate %s from legacy repo DB', TABLE_NAME)


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
        pass
    return conn


def init_cost_contract_tab61_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            _ensure_tab61_schema(conn)
            conn.commit()
        try:
            _maybe_migrate_from_legacy_repo_db(app)
        except Exception:
            pass
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (name,),
    ).fetchone()
    return bool(row)


def _get_table_columns(conn: sqlite3.Connection, name: str) -> List[str]:
    rows = conn.execute(f"PRAGMA table_info({name})").fetchall()
    return [r[1] for r in rows]  # type: ignore[index]


def _create_tab61_table(conn: sqlite3.Connection, name: str) -> None:
    cols_sql = ',\n                    '.join([f"{c} {t}" for c, t in _DESIRED_COLUMNS])
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {name} (
                    {cols_sql}
        )
        """
    )
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{name}_scope_type ON {name}(scope, cost_type)")
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{name}_contract_year ON {name}(contract_id, year)")
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{name}_deleted ON {name}(is_deleted)")


def _ensure_tab61_schema(conn: sqlite3.Connection) -> None:
    """Ensure TABLE_NAME matches desired schema.

    SQLite has limited ALTER support across versions; we rebuild the table when we detect legacy columns.
    """

    desired = [c for c, _ in _DESIRED_COLUMNS]

    if not _table_exists(conn, TABLE_NAME):
        _create_tab61_table(conn, TABLE_NAME)
        return

    existing = _get_table_columns(conn, TABLE_NAME)
    existing_set = set(existing)
    desired_set = set(desired)

    # Legacy columns we intentionally removed.
    legacy_cols = {'work_status', 'work_category'}
    needs_rebuild = bool(existing_set & legacy_cols) or not desired_set.issubset(existing_set)
    if not needs_rebuild:
        return

    tmp = f"{TABLE_NAME}__rebuild"
    conn.execute(f"DROP TABLE IF EXISTS {tmp}")
    _create_tab61_table(conn, tmp)

    # Copy what we can from the legacy table.
    common = [c for c in desired if c in existing_set]
    if not common:
        conn.execute(f"DROP TABLE IF EXISTS {TABLE_NAME}")
        conn.execute(f"ALTER TABLE {tmp} RENAME TO {TABLE_NAME}")
        return

    # Best-effort migration from removed legacy columns.
    insert_cols_list = list(common)
    select_cols_list = list(common)
    if 'contract_status' not in existing_set and 'work_status' in existing_set:
        insert_cols_list.append('contract_status')
        select_cols_list.append('work_status')
    if 'contract_type' not in existing_set and 'work_category' in existing_set:
        insert_cols_list.append('contract_type')
        select_cols_list.append('work_category')

    insert_cols = ', '.join(insert_cols_list)
    select_cols = ', '.join(select_cols_list)
    conn.execute(
        f"""
        INSERT INTO {tmp} ({insert_cols})
        SELECT {select_cols}
        FROM {TABLE_NAME}
        """
    )

    conn.execute(f"DROP TABLE IF EXISTS {TABLE_NAME}")
    conn.execute(f"ALTER TABLE {tmp} RENAME TO {TABLE_NAME}")

    # Recreate indexes for the canonical name.
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_scope_type ON {TABLE_NAME}(scope, cost_type)")
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_contract_year ON {TABLE_NAME}(contract_id, year)")
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)")


def _sanitize_scope(raw: Any) -> str:
    token = ('' if raw is None else str(raw)).strip().upper()
    if token not in VALID_SCOPES:
        raise ValueError('scope는 OPEX 또는 CAPEX 여야 합니다.')
    return token


def _sanitize_type(raw: Any) -> str:
    token = ('' if raw is None else str(raw)).strip().upper()
    if token not in VALID_TYPES:
        raise ValueError('cost_type은 HW, SW, ETC 중 하나여야 합니다.')
    return token


def _sanitize_year(raw: Any) -> int:
    try:
        year = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError('year 값이 올바르지 않습니다.') from exc
    if year < 2000 or year > 2100:
        raise ValueError('year 범위가 올바르지 않습니다.')
    return year


def _sanitize_int(raw: Any, *, allow_none: bool = True) -> Optional[int]:
    if raw in (None, ''):
        return None if allow_none else 0
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None if allow_none else 0


def _sanitize_text(raw: Any, *, max_len: int = 250) -> str:
    text = ('' if raw is None else str(raw)).strip()
    if text == '-':
        text = ''
    if max_len and len(text) > max_len:
        text = text[:max_len]
    return text


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    keys = set(row.keys())

    def s(key: str) -> str:
        if key not in keys:
            return ''
        v = row[key]
        return '' if v is None else str(v)

    def m(key: str) -> int:
        if key not in keys:
            return 0
        v = row[key]
        return int(v) if v is not None else 0

    months = {f"m{i:02d}": m(f"m{i:02d}") for i in range(1, 13)}
    total = sum(months.values())
    return {
        'id': row['id'],
        'scope': row['scope'],
        'cost_type': row['cost_type'],
        'contract_id': row['contract_id'],
        'year': row['year'],
        'contract_status': s('contract_status'),
        'work_name': s('work_name'),
        'system_name': s('system_name'),
        'contract_type': s('contract_type'),
        'contract_vendor': s('contract_vendor'),
        'contract_model': s('contract_model'),
        'contract_qty': m('contract_qty'),
        'contract_serial': s('contract_serial'),
        'description': s('description'),
        **months,
        'sum': total,
        'created_at': row['created_at'],
        'created_by': s('created_by'),
        'updated_at': s('updated_at'),
        'updated_by': s('updated_by'),
        'is_deleted': row['is_deleted'],
    }


def list_tab61_lines(
    *,
    scope: str,
    cost_type: str,
    contract_id: int = 0,
    year: int,
    include_deleted: bool = False,
    app=None,
) -> List[Dict[str, Any]]:
    scope_norm = _sanitize_scope(scope)
    type_norm = _sanitize_type(cost_type)
    contract_id_int = _sanitize_int(contract_id, allow_none=False) or 0
    year_int = _sanitize_year(year)

    init_cost_contract_tab61_table(app)

    where = ['scope = ?', 'cost_type = ?', 'contract_id = ?', 'year = ?']
    params: List[Any] = [scope_norm, type_norm, contract_id_int, year_int]
    if not include_deleted:
        where.append('is_deleted = 0')

    with _get_connection(app) as conn:
        rows = conn.execute(
            f"""
            SELECT *
            FROM {TABLE_NAME}
            WHERE {' AND '.join(where)}
            ORDER BY id ASC
            """,
            params,
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def find_tab61_contract_for_work_system(
    *,
    scope: str,
    cost_type: str,
    year: int,
    work_name: str,
    system_name: str,
    include_deleted: bool = False,
    app=None,
) -> Optional[Dict[str, Any]]:
    """Find the latest tab61 line for (work_name, system_name) in the given year.

    This is used by hardware pages to map a server asset to a tab61 contract
    without exposing or requiring the numeric contract_id in the browser.
    """

    scope_norm = _sanitize_scope(scope)
    type_norm = _sanitize_type(cost_type)
    year_int = _sanitize_year(year)
    work = _sanitize_text(work_name, max_len=200)
    system = _sanitize_text(system_name, max_len=200)
    if not work and not system:
        return None

    init_cost_contract_tab61_table(app)

    where = ['scope = ?', 'cost_type = ?', 'year = ?']
    params: List[Any] = [scope_norm, type_norm, year_int]
    if work:
        where.append('work_name = ?')
        params.append(work)
    if system:
        where.append('system_name = ?')
        params.append(system)
    if not include_deleted:
        where.append('is_deleted = 0')

    with _get_connection(app) as conn:
        row = conn.execute(
            f"""
            SELECT id, scope, cost_type, contract_id, year, contract_status, work_name, system_name
            FROM {TABLE_NAME}
            WHERE {' AND '.join(where)}
              AND COALESCE(contract_id, 0) > 0
            ORDER BY id DESC
            LIMIT 1
            """,
            params,
        ).fetchone()
        if not row:
            return None
        return {
            'line_id': row['id'],
            'scope': row['scope'],
            'cost_type': row['cost_type'],
            'contract_id': int(row['contract_id'] or 0),
            'year': int(row['year'] or 0),
            'contract_status': row['contract_status'] or '',
            'work_name': row['work_name'] or '',
            'system_name': row['system_name'] or '',
        }


def list_tab61_lines_for_work_system(
    *,
    scope: str,
    cost_type: str,
    year: int,
    work_name: str,
    system_name: str,
    include_deleted: bool = False,
    app=None,
) -> List[Dict[str, Any]]:
    """List tab61 lines for (work_name, system_name) in the given year.

    Used by hardware detail pages to do strict per-row matching between tab01-hardware
    table rows and tab61 '계약정보' lines.
    """

    scope_norm = _sanitize_scope(scope)
    type_norm = _sanitize_type(cost_type)
    year_int = _sanitize_year(year)
    work = _sanitize_text(work_name, max_len=200)
    system = _sanitize_text(system_name, max_len=200)
    if not work and not system:
        return []

    init_cost_contract_tab61_table(app)

    where = ['scope = ?', 'cost_type = ?', 'year = ?']
    params: List[Any] = [scope_norm, type_norm, year_int]
    if work:
        where.append('work_name = ?')
        params.append(work)
    if system:
        where.append('system_name = ?')
        params.append(system)
    if not include_deleted:
        where.append('is_deleted = 0')

    with _get_connection(app) as conn:
        rows = conn.execute(
            f"""
            SELECT *
            FROM {TABLE_NAME}
            WHERE {' AND '.join(where)}
              AND COALESCE(contract_id, 0) > 0
            ORDER BY id ASC
            """,
            params,
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def create_tab61_line(payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    scope = _sanitize_scope(payload.get('scope'))
    cost_type = _sanitize_type(payload.get('cost_type'))
    contract_id = _sanitize_int(payload.get('contract_id'), allow_none=False) or 0
    year = _sanitize_year(payload.get('year'))

    contract_status = _sanitize_text(payload.get('contract_status'), max_len=60)
    work_name = _sanitize_text(payload.get('work_name'), max_len=200)
    system_name = _sanitize_text(payload.get('system_name'), max_len=200)
    contract_type = _sanitize_text(payload.get('contract_type'), max_len=80)
    contract_vendor = _sanitize_text(payload.get('contract_vendor'), max_len=120)
    contract_model = _sanitize_text(payload.get('contract_model'), max_len=120)
    contract_qty = _sanitize_int(payload.get('contract_qty'), allow_none=True)
    contract_serial = _sanitize_text(payload.get('contract_serial'), max_len=160)
    description = _sanitize_text(payload.get('description'), max_len=500)

    months = {f"m{i:02d}": _sanitize_int(payload.get(f"m{i:02d}"), allow_none=True) for i in range(1, 13)}

    contract_status = _auto_expire_contract_status(year=year, months=months, current_status=contract_status)

    init_cost_contract_tab61_table(app)

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                scope, cost_type, contract_id, year,
                contract_status, work_name, system_name,
                contract_type, contract_vendor, contract_model, contract_qty, contract_serial,
                m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12,
                description,
                created_at, created_by
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?,
                ?, ?
            )
            """,
            (
                scope,
                cost_type,
                contract_id,
                year,
                contract_status,
                work_name,
                system_name,
                contract_type,
                contract_vendor,
                contract_model,
                contract_qty,
                contract_serial,
                months['m01'],
                months['m02'],
                months['m03'],
                months['m04'],
                months['m05'],
                months['m06'],
                months['m07'],
                months['m08'],
                months['m09'],
                months['m10'],
                months['m11'],
                months['m12'],
                description,
                _now(),
                (actor or 'system').strip() or 'system',
            ),
        )
        new_id = int(cur.lastrowid)
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (new_id,)).fetchone()
        conn.commit()
        return _row_to_dict(row)


def update_tab61_line(line_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Optional[Dict[str, Any]]:
    line_id_int = _sanitize_int(line_id, allow_none=False)
    if not line_id_int:
        raise ValueError('line_id 값이 올바르지 않습니다.')

    init_cost_contract_tab61_table(app)

    contract_status = _sanitize_text(payload.get('contract_status'), max_len=60)
    work_name = _sanitize_text(payload.get('work_name'), max_len=200)
    system_name = _sanitize_text(payload.get('system_name'), max_len=200)
    contract_type = _sanitize_text(payload.get('contract_type'), max_len=80)
    contract_vendor = _sanitize_text(payload.get('contract_vendor'), max_len=120)
    contract_model = _sanitize_text(payload.get('contract_model'), max_len=120)
    contract_qty = _sanitize_int(payload.get('contract_qty'), allow_none=True)
    contract_serial = _sanitize_text(payload.get('contract_serial'), max_len=160)
    description = _sanitize_text(payload.get('description'), max_len=500)
    months = {f"m{i:02d}": _sanitize_int(payload.get(f"m{i:02d}"), allow_none=True) for i in range(1, 13)}

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT year FROM {TABLE_NAME} WHERE id = ?",
            (line_id_int,),
        ).fetchone()
        if not existing:
            return None

        # Keep server-side truth in sync with the auto-expire business rule.
        try:
            stored_year = int(existing['year'])
        except Exception:
            stored_year = datetime.now().year
        contract_status = _auto_expire_contract_status(year=stored_year, months=months, current_status=contract_status)

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET contract_status = ?, work_name = ?, system_name = ?,
                contract_type = ?, contract_vendor = ?, contract_model = ?, contract_qty = ?, contract_serial = ?,
                m01 = ?, m02 = ?, m03 = ?, m04 = ?, m05 = ?, m06 = ?,
                m07 = ?, m08 = ?, m09 = ?, m10 = ?, m11 = ?, m12 = ?,
                description = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (
                contract_status,
                work_name,
                system_name,
                contract_type,
                contract_vendor,
                contract_model,
                contract_qty,
                contract_serial,
                months['m01'],
                months['m02'],
                months['m03'],
                months['m04'],
                months['m05'],
                months['m06'],
                months['m07'],
                months['m08'],
                months['m09'],
                months['m10'],
                months['m11'],
                months['m12'],
                description,
                _now(),
                (actor or 'system').strip() or 'system',
                line_id_int,
            ),
        )
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (line_id_int,)).fetchone()
        conn.commit()
        return _row_to_dict(row)


def soft_delete_tab61_lines(ids: Iterable[Any], *, actor: str = 'system', app=None) -> int:
    init_cost_contract_tab61_table(app)

    id_list: List[int] = []
    for raw in ids:
        n = _sanitize_int(raw, allow_none=True)
        if n:
            id_list.append(n)
    if not id_list:
        return 0

    placeholders = ','.join(['?'] * len(id_list))
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET is_deleted = 1,
                updated_at = ?,
                updated_by = ?
            WHERE id IN ({placeholders})
            """,
            (_now(), (actor or 'system').strip() or 'system', *id_list),
        )
        conn.commit()
        return len(id_list)


def hard_delete_tab61_line(line_id: int, *, app=None) -> bool:
    line_id_int = _sanitize_int(line_id, allow_none=False)
    if not line_id_int:
        return False
    init_cost_contract_tab61_table(app)
    with _get_connection(app) as conn:
        cur = conn.execute(f"DELETE FROM {TABLE_NAME} WHERE id = ?", (line_id_int,))
        conn.commit()
        return (cur.rowcount or 0) > 0
