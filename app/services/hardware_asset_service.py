"""Service helpers for hardware_asset CRUD using sqlite3 only."""

from __future__ import annotations

import logging
import os
import secrets
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)
DB_FILENAME = "hardware_asset.db"

# Canonical table name requested for dev_blossom.db.
TABLE_NAME = "hardware"
# Backward-compatible legacy table name.
LEGACY_TABLE_NAME = "hardware_asset"

HARDWARE_ASSET_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_category       TEXT NOT NULL,
    asset_type           TEXT NOT NULL,
    asset_code           TEXT NOT NULL UNIQUE,
    asset_name           TEXT NOT NULL,
    work_category_code   TEXT,
    work_division_code   TEXT,
    work_status_code     TEXT,
    work_operation_code  TEXT,
    work_group_code      TEXT,
    work_name            TEXT,
    system_name          TEXT,
    system_ip            TEXT,
    mgmt_ip              TEXT,
    manufacturer_code    TEXT,
    server_code          TEXT,
    serial_number        TEXT,
    center_code          TEXT,
    rack_code            TEXT,
    system_slot          INTEGER,
    system_size          INTEGER,
    rack_face            TEXT DEFAULT 'FRONT',
    system_dept_code     TEXT,
    system_owner_emp_no  TEXT,
    system_owner_display TEXT,
    service_dept_code    TEXT,
    service_owner_emp_no TEXT,
    service_owner_display TEXT,
    virtualization_type  TEXT,
    cia_confidentiality  INTEGER,
    cia_integrity        INTEGER,
    cia_availability     INTEGER,
    security_score       INTEGER,
    system_grade         TEXT,
    is_core_system       INTEGER DEFAULT 0,
    has_dr_site          INTEGER DEFAULT 0,
    has_service_ha       INTEGER DEFAULT 0,
    service_ha_type      TEXT,
    created_at           TEXT NOT NULL,
    created_by           TEXT NOT NULL,
    updated_at           TEXT,
    updated_by           TEXT,
    is_deleted           INTEGER NOT NULL DEFAULT 0,
    is_disposed          INTEGER NOT NULL DEFAULT 0,
    disposed_at          TEXT,
    disposed_by          TEXT,
    FOREIGN KEY (work_category_code)   REFERENCES biz_work_category(category_code),
    FOREIGN KEY (work_division_code)   REFERENCES biz_work_division(division_code),
    FOREIGN KEY (work_status_code)     REFERENCES biz_work_status(status_code),
    FOREIGN KEY (work_operation_code)  REFERENCES biz_work_operation(operation_code),
    FOREIGN KEY (work_group_code)      REFERENCES biz_work_group(group_code),
    FOREIGN KEY (manufacturer_code)    REFERENCES biz_vendor_manufacturer(manufacturer_code),
    FOREIGN KEY (server_code)          REFERENCES hw_server_type(server_code),
    FOREIGN KEY (center_code)          REFERENCES org_center(center_code),
    FOREIGN KEY (rack_code)            REFERENCES org_rack(rack_code),
    FOREIGN KEY (system_dept_code)     REFERENCES org_department(dept_code),
    FOREIGN KEY (system_owner_emp_no)  REFERENCES org_user(emp_no),
    FOREIGN KEY (service_dept_code)    REFERENCES org_department(dept_code),
    FOREIGN KEY (service_owner_emp_no) REFERENCES org_user(emp_no)
);
CREATE INDEX IF NOT EXISTS idx_hardware_code ON {TABLE_NAME}(asset_code);
CREATE INDEX IF NOT EXISTS idx_hardware_center ON {TABLE_NAME}(center_code);
CREATE INDEX IF NOT EXISTS idx_hardware_rack ON {TABLE_NAME}(rack_code);
"""

_INITIALIZED_DBS: Set[str] = set()
_OWNER_TABLE_CACHE: Dict[str, bool] = {}
_OWNER_TABLE_WARNED: Set[str] = set()

_CODE_ALIAS_MAP = {
    "work_type": "work_category_code",
    "work_category": "work_division_code",
    "work_status": "work_status_code",
    "work_operation": "work_operation_code",
    "work_group": "work_group_code",
    "vendor": "manufacturer_code",
    "model": "server_code",
    # UI keys used by hardware detail pages
    "location_place": "center_code",
    "location_pos": "rack_code",
    "sys_dept": "system_dept_code",
    "svc_dept": "service_dept_code",
    "sys_owner": "system_owner_emp_no",
    "svc_owner": "service_owner_emp_no",
    "system_department": "system_dept_code",
    "service_department": "service_dept_code",
    "system_owner": "system_owner_emp_no",
    "service_owner": "service_owner_emp_no",
    "sys_owner_display": "system_owner_display",
    "svc_owner_display": "service_owner_display",
    "slot": "system_slot",
    "u_size": "system_size",
    "rack_face": "rack_face",
    "serial": "serial_number",
}

BOOLEAN_STRINGS = {
    True: {"1", "true", "True", "TRUE", "yes", "y", "Y", "on", "ON", "핵심", "O"},
    False: {"0", "false", "False", "FALSE", "no", "n", "N", "off", "OFF", "일반", "X"},
}

_OWNER_CANONICAL_KEYS = ("system_owner_emp_no", "service_owner_emp_no")
_OWNER_ALIAS_KEYS = ("system_owner", "service_owner")


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get("HARDWARE_ASSET_DB_PATH")
    if override:
        return os.path.abspath(override)
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
    if uri.startswith("sqlite"):
        parsed = urlparse(uri)
        path = parsed.path or ""
        netloc = parsed.netloc or ""
        if path in (":memory:", "/:memory:"):
            return os.path.join(app.instance_path, DB_FILENAME)
        if netloc not in ("", "localhost"):
            path = f"//{netloc}{path}"

        # urlparse('sqlite:///dev_blossom.db').path  -> '/dev_blossom.db'  (relative)
        # urlparse('sqlite:////abs/path.db').path   -> '//abs/path.db'   (absolute)
        # A single leading '/' means sqlite:/// (3-slash = relative to instance).
        # Double '//' means sqlite://// (4-slash = truly absolute path).
        if path.startswith('/') and not path.startswith('//'):
            path = path.lstrip('/')
            # On Windows '/C:/foo.db' -> 'C:/foo.db'
            # On Linux   '/dev_blossom.db' -> 'dev_blossom.db'  (relative)

        if os.path.isabs(path):
            return os.path.abspath(path)

        # Keep relative SQLite filenames aligned with Flask-SQLAlchemy, which
        # resolves "sqlite:///filename.db" under instance_path.
        relative = path.lstrip("/")
        instance_candidate = os.path.abspath(os.path.join(app.instance_path, relative))
        project_candidate = os.path.abspath(os.path.join(_project_root(app), relative))
        if os.path.exists(instance_candidate):
            return instance_candidate
        if os.path.exists(project_candidate):
            return project_candidate
        return instance_candidate
    return os.path.join(app.instance_path, DB_FILENAME)


def _ensure_parent(path: str) -> None:
    folder = os.path.dirname(path)
    if folder and not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True)


def _ensure_schema(conn: sqlite3.Connection, db_path: str) -> None:
    def _ensure_legacy_view_alias() -> None:
        """Expose the canonical table under the legacy name for read compatibility.

        Some older code paths or DB snapshots may still refer to the legacy
        `hardware_asset` name. A VIEW keeps list/read endpoints working even when
        the canonical table is `hardware`.
        """

        try:
            obj_rows = conn.execute(
                "SELECT name, type FROM sqlite_master WHERE name IN (?, ?) AND type IN ('table','view')",
                (TABLE_NAME, LEGACY_TABLE_NAME),
            ).fetchall()
            obj_types = {r[0]: r[1] for r in obj_rows}
            if obj_types.get(TABLE_NAME) in ("table", "view") and LEGACY_TABLE_NAME not in obj_types:
                conn.execute(f"CREATE VIEW IF NOT EXISTS {LEGACY_TABLE_NAME} AS SELECT * FROM {TABLE_NAME}")
        except Exception:
            logger.exception("hardware_asset_service: failed to create legacy view alias")

    if db_path in _INITIALIZED_DBS:
        _ensure_legacy_view_alias()
        return

    # One-time migration: rename legacy table name.
    try:
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if TABLE_NAME not in tables and LEGACY_TABLE_NAME in tables:
            conn.execute(f"ALTER TABLE {LEGACY_TABLE_NAME} RENAME TO {TABLE_NAME};")
            conn.commit()
    except Exception:
        logger.exception("hardware_asset_service: failed to rename legacy table")

    conn.executescript(HARDWARE_ASSET_TABLE_SQL)

    # Backward compatibility: provide a read-only alias for older name.
    _ensure_legacy_view_alias()

    # Historical DBs may have been created with FK constraints pointing at the legacy
    # "user" VIEW, which SQLite cannot use as a valid FK target (causes
    # sqlite3.OperationalError: foreign key mismatch). Heal by rebuilding the table
    # with org_user(emp_no) as the FK target.
    try:
        fk_rows = conn.execute(f"PRAGMA foreign_key_list({TABLE_NAME})").fetchall()
        has_legacy_user_fk = any(
            (r[2] if isinstance(r, (tuple, list)) else r[2]) == 'user'
            for r in fk_rows
        )
        if has_legacy_user_fk:
            conn.execute("PRAGMA foreign_keys = OFF;")
            conn.execute(f"ALTER TABLE {TABLE_NAME} RENAME TO {TABLE_NAME}__old;")
            conn.executescript(HARDWARE_ASSET_TABLE_SQL)

            old_cols = [r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME}__old)").fetchall()]
            new_cols = [r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()]
            common = [c for c in old_cols if c in new_cols]
            if common:
                cols_sql = ", ".join(common)
                conn.execute(
                    f"INSERT INTO {TABLE_NAME} ({cols_sql}) SELECT {cols_sql} FROM {TABLE_NAME}__old"
                )
            conn.execute(f"DROP TABLE {TABLE_NAME}__old;")
            conn.execute("PRAGMA foreign_keys = ON;")
    except Exception:
        # Best-effort heal. If this fails, normal operations will surface the error.
        logger.exception("hardware_asset_service: failed to heal legacy FK schema")

    # Backfill new columns on existing DBs (SQLite has no IF NOT EXISTS for ADD COLUMN)
    try:
        cols = {r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
        if "system_slot" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN system_slot INTEGER")
        if "system_size" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN system_size INTEGER")
        if "serial_number" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN serial_number TEXT")
        if "firmware" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN firmware TEXT")
        if "system_owner_display" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN system_owner_display TEXT")
        if "service_owner_display" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN service_owner_display TEXT")
        if "rack_face" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN rack_face TEXT DEFAULT 'FRONT'")
        if "is_disposed" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN is_disposed INTEGER NOT NULL DEFAULT 0")
        if "disposed_at" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN disposed_at TEXT")
        if "disposed_by" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN disposed_by TEXT")
        if "tpmc_total" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN tpmc_total REAL")
        if "tpmc_managed" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN tpmc_managed REAL")
        if "tpmc_updated_at" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN tpmc_updated_at TEXT")
    except Exception:
        # Best-effort: schema may not exist yet or table might be locked.
        pass

    # Cleanup: if a DB was previously using the legacy table name, SQLite will keep
    # the old index names after `ALTER TABLE ... RENAME TO ...`. Those legacy indexes
    # are redundant once the new canonical idx_hardware_* indexes exist.
    try:
        index_rows = conn.execute(f"PRAGMA index_list({TABLE_NAME})").fetchall()
        legacy_index_names: Set[str] = set()
        for row in index_rows:
            # PRAGMA index_list returns: (seq, name, unique, origin, partial)
            idx_name = row[1] if isinstance(row, (tuple, list)) else row[1]
            if isinstance(idx_name, str) and idx_name.startswith("idx_hardware_asset_"):
                legacy_index_names.add(idx_name)

        for idx_name in sorted(legacy_index_names):
            safe = idx_name.replace('"', '""')
            conn.execute(f'DROP INDEX IF EXISTS "{safe}"')
    except Exception:
        # Best-effort cleanup; not critical for correctness.
        pass
    conn.commit()
    _INITIALIZED_DBS.add(db_path)


# Auxiliary SQLite DB files required for LEFT JOIN lookups.
# (filename, alias) — alias is used as the ATTACH schema name.
_AUXILIARY_DBS = [
    ('work_category.db',      'aux_wc'),
    ('work_division.db',      'aux_wd'),
    ('work_status.db',        'aux_ws'),
    ('work_operation.db',     'aux_wo'),
    ('work_group.db',         'aux_wg'),
    ('vendor_manufacturer.db','aux_vm'),
    ('hw_server_type.db',     'aux_hst'),
    ('org_center.db',         'aux_oc'),
    ('org_rack.db',           'aux_or'),
    ('org_department.db',     'aux_od'),
]


def _attach_auxiliary_dbs(conn: sqlite3.Connection, app) -> None:
    """ATTACH auxiliary SQLite DBs so LEFT JOIN lookups can resolve."""
    instance_path = app.instance_path
    for db_file, alias in _AUXILIARY_DBS:
        db_full = os.path.join(instance_path, db_file)
        if os.path.exists(db_full):
            try:
                conn.execute(f"ATTACH DATABASE ? AS {alias}", (db_full,))
            except sqlite3.OperationalError:
                pass  # already attached or limit reached


def _get_connection(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = _resolve_db_path(app)
    _ensure_parent(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    _ensure_schema(conn, db_path)
    _attach_auxiliary_dbs(conn, app)
    return conn


def _database_identity(conn: sqlite3.Connection) -> str:
    try:
        row = conn.execute("PRAGMA database_list").fetchone()
        if row and len(row) >= 3 and row[2]:
            return os.path.abspath(row[2])
    except Exception:
        pass
    return "memory"


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
        (table_name,),
    )
    return cur.fetchone() is not None


def _owner_table_available(conn: sqlite3.Connection) -> bool:
    db_key = _database_identity(conn)
    if db_key in _OWNER_TABLE_CACHE:
        return _OWNER_TABLE_CACHE[db_key]
    exists = _table_exists(conn, "org_user")
    _OWNER_TABLE_CACHE[db_key] = exists
    if not exists and db_key not in _OWNER_TABLE_WARNED:
        logger.warning('hardware_asset_service: "org_user" table missing in %s; owner joins disabled', db_key)
        _OWNER_TABLE_WARNED.add(db_key)
    return exists


def _owner_join_fragments(conn: sqlite3.Connection) -> Tuple[str, str]:
    if _owner_table_available(conn):
        return (
            """
            COALESCE(sys_user.name, ha.system_owner_display, ha.system_owner_emp_no) AS system_owner_name,
            COALESCE(svc_user.name, ha.service_owner_display, ha.service_owner_emp_no) AS service_owner_name
        """,
            """
        LEFT JOIN org_user sys_user ON sys_user.emp_no = ha.system_owner_emp_no
        LEFT JOIN org_user svc_user ON svc_user.emp_no = ha.service_owner_emp_no
        """,
        )
    return (
        """
            COALESCE(ha.system_owner_display, ha.system_owner_emp_no) AS system_owner_name,
            COALESCE(ha.service_owner_display, ha.service_owner_emp_no) AS service_owner_name
        """,
        "",
    )


def usage_counts_by_server_code(
    app=None,
    *,
    asset_category: Optional[str] = "SERVER",
    include_deleted: bool = False,
) -> Dict[str, int]:
    """Return {server_code: count} from hardware_asset.

    This is used to display how many hardware assets reference each server model/type.
    """

    app = app or current_app
    with _get_connection(app) as conn:
        where_clauses: List[str] = [
            "ha.server_code IS NOT NULL",
            "TRIM(ha.server_code) != ''",
        ]
        params: List[Any] = []

        if not include_deleted:
            where_clauses.append("ha.is_deleted = 0")
        if asset_category:
            where_clauses.append("ha.asset_category = ?")
            params.append(asset_category)

        rows = conn.execute(
            f"""
            SELECT ha.server_code AS server_code, COUNT(1) AS cnt
            FROM {TABLE_NAME} ha
            WHERE {' AND '.join(where_clauses)}
            GROUP BY ha.server_code
            """,
            params,
        ).fetchall()

        return {str(row["server_code"]): int(row["cnt"] or 0) for row in rows}


def suggest_hardware_asset_values(
    field: str,
    q: Optional[str] = None,
    limit: int = 20,
    *,
    asset_category: Optional[str] = None,
    asset_type: Optional[Union[Sequence[str], str]] = None,
    work_name: Optional[str] = None,
    app=None,
) -> List[str]:
    """Return distinct suggestions for specific text columns.

    Only supports a small allowlist for safety.
    """
    allowed = {"work_name", "system_name"}
    f = (field or "").strip()
    if f not in allowed:
        raise ValueError("지원하지 않는 field 입니다.")
    query_text = (q or "").strip()
    lim = int(limit or 20)
    if lim <= 0:
        lim = 20
    lim = min(lim, 50)

    conn = _get_connection(app)
    try:
        where_clauses: List[str] = [
            "ha.is_deleted = 0",
            "ha.is_disposed = 0",
            "ha.{f} IS NOT NULL".format(f=f),
            "TRIM(ha.{f}) != ''".format(f=f),
        ]
        params: List[Any] = []

        if asset_category and str(asset_category).strip():
            where_clauses.append("ha.asset_category = ?")
            params.append(str(asset_category).strip())

        if asset_type is not None:
            raw_types: List[str] = []
            if isinstance(asset_type, str):
                raw_types = [s.strip() for s in asset_type.split(',') if s and s.strip()]
            else:
                raw_types = [str(s).strip() for s in asset_type if s is not None and str(s).strip()]
            if raw_types:
                placeholders = ",".join(["?"] * len(raw_types))
                where_clauses.append(f"ha.asset_type IN ({placeholders})")
                params.extend(raw_types)

        # Allow narrowing system_name suggestions by the selected work_name.
        if f == "system_name" and work_name and str(work_name).strip():
            where_clauses.append("ha.work_name = ?")
            params.append(str(work_name).strip())

        where = " AND ".join(where_clauses)
        if query_text:
            where += " AND ha.{f} LIKE ?".format(f=f)
            params.append(f"%{query_text}%")
        params.append(lim)
        sql = """
            SELECT DISTINCT ha.{f} AS value
            FROM {table} ha
            WHERE {where}
            ORDER BY ha.{f} ASC
            LIMIT ?
        """.format(f=f, where=where, table=TABLE_NAME)
        rows = conn.execute(sql, params).fetchall()
        out: List[str] = []
        for r in rows:
            try:
                v = (r["value"] if isinstance(r, sqlite3.Row) else r[0])
            except Exception:
                v = None
            if v is None:
                continue
            s = str(v).strip()
            if s:
                out.append(s)
        return out
    finally:
        try:
            conn.close()
        except Exception:
            pass


# Allowed asset_type values for bay lookup (whitelist prevents injection).
_BAY_LOOKUP_ALLOWED_TYPES = frozenset(('ON_PREMISE', 'STORAGE', 'SWITCH', 'DIRECTOR', 'L2', 'L4', 'L7'))


def lookup_bay_onpremise_servers(
    work_name: Optional[str] = None,
    asset_type: Optional[str] = None,
    app=None,
) -> List[Dict[str, str]]:
    """Return hardware asset data for bay dropdown usage.

    *asset_type* may be a single value or comma-separated list of values.
    Each value is checked against a whitelist.
    If *work_name* is ``None``, return distinct work_names.
    If *work_name* is given, return systems with vendor/model/serial for that work.
    """

    raw = str(asset_type or 'ON_PREMISE').strip().upper()
    types = [t.strip() for t in raw.split(',') if t.strip()]
    types = [t for t in types if t in _BAY_LOOKUP_ALLOWED_TYPES]
    if not types:
        types = ['ON_PREMISE']

    placeholders = ','.join('?' for _ in types)

    conn = _get_connection(app)
    try:
        if not work_name or not str(work_name).strip():
            sql = f"""
                SELECT DISTINCT ha.work_name
                FROM {TABLE_NAME} ha
                WHERE ha.is_deleted = 0
                  AND ha.is_disposed = 0
                  AND ha.asset_type IN ({placeholders})
                  AND ha.work_name IS NOT NULL
                  AND TRIM(ha.work_name) != ''
                ORDER BY ha.work_name ASC
                LIMIT 500
            """
            rows = conn.execute(sql, types).fetchall()
            return [{'work_name': str(r[0]).strip()} for r in rows if str(r[0] or '').strip()]
        else:
            sql = f"""
                SELECT
                    COALESCE(NULLIF(TRIM(ha.system_name), ''), TRIM(ha.asset_name)) AS system_name,
                    COALESCE(bvm.manufacturer_name, '') AS manufacturer_name,
                    COALESCE(hst.model_name, '') AS model_name,
                    COALESCE(ha.serial_number, '') AS serial_number
                FROM {TABLE_NAME} ha
                LEFT JOIN biz_vendor_manufacturer bvm ON bvm.manufacturer_code = ha.manufacturer_code
                LEFT JOIN hw_server_type hst ON hst.server_code = ha.server_code
                WHERE ha.is_deleted = 0
                  AND ha.is_disposed = 0
                  AND ha.asset_type IN ({placeholders})
                  AND ha.work_name = ?
                ORDER BY system_name ASC
                LIMIT 500
            """
            rows = conn.execute(sql, types + [str(work_name).strip()]).fetchall()
            out: List[Dict[str, str]] = []
            for r in rows:
                sn = str(r[0] or '').strip()
                if not sn:
                    continue
                out.append({
                    'system_name': sn,
                    'manufacturer_name': str(r[1] or '').strip(),
                    'model_name': str(r[2] or '').strip(),
                    'serial_number': str(r[3] or '').strip(),
                })
            return out
    finally:
        try:
            conn.close()
        except Exception:
            pass


def suggest_hardware_work_system_pairs(
    q: Optional[str] = None,
    limit: int = 50,
    *,
    asset_category: Optional[str] = None,
    asset_type: Optional[Union[Sequence[str], str]] = None,
    app=None,
) -> List[Dict[str, str]]:
    """Return distinct (work_name, system_name) pairs for dropdown usage."""

    query_text = (q or '').strip()
    lim = int(limit or 50)
    if lim <= 0:
        lim = 50
    lim = min(lim, 100)

    conn = _get_connection(app)
    try:
        where_clauses: List[str] = [
            "ha.is_deleted = 0",
            "ha.is_disposed = 0",
            "ha.work_name IS NOT NULL",
            "TRIM(ha.work_name) != ''",
            "(TRIM(COALESCE(ha.system_name, '')) != '' OR TRIM(COALESCE(ha.asset_name, '')) != '')",
        ]
        params: List[Any] = []

        if asset_category and str(asset_category).strip():
            where_clauses.append("ha.asset_category = ?")
            params.append(str(asset_category).strip())

        if asset_type is not None:
            raw_types: List[str] = []
            if isinstance(asset_type, str):
                raw_types = [s.strip() for s in asset_type.split(',') if s and s.strip()]
            else:
                raw_types = [str(s).strip() for s in asset_type if s is not None and str(s).strip()]
            if raw_types:
                placeholders = ",".join(["?"] * len(raw_types))
                where_clauses.append(f"ha.asset_type IN ({placeholders})")
                params.extend(raw_types)

        if query_text:
            where_clauses.append("(ha.work_name LIKE ? OR ha.system_name LIKE ? OR ha.asset_name LIKE ?)")
            like = f"%{query_text}%"
            params.extend([like, like, like])

        params.append(lim)

        # NOTE: Many legacy DBs store the user-facing system identifier in asset_name,
        # with system_name left blank. Use asset_name as a fallback so dropdowns remain usable.
        sql = """
            SELECT DISTINCT
                ha.work_name AS work_name,
                COALESCE(NULLIF(TRIM(ha.system_name), ''), TRIM(ha.asset_name)) AS system_name
            FROM {table} ha
            WHERE {where}
            ORDER BY ha.work_name ASC, system_name ASC
            LIMIT ?
        """.format(table=TABLE_NAME, where=" AND ".join(where_clauses))

        rows = conn.execute(sql, params).fetchall()
        out: List[Dict[str, str]] = []
        for r in rows:
            try:
                work_name = (r["work_name"] if isinstance(r, sqlite3.Row) else r[0])
                system_name = (r["system_name"] if isinstance(r, sqlite3.Row) else r[1])
            except Exception:
                continue
            w = str(work_name or '').strip()
            s = str(system_name or '').strip()
            if not w or not s:
                continue
            out.append({'work_name': w, 'system_name': s})
        return out
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _normalize_owner_payload(payload: Dict[str, Any], allow_owner_fk: bool) -> Tuple[Dict[str, Any], bool]:
    """Move helper owner display values onto canonical columns, prefer plain text names."""

    if not any(key in payload for key in (*_OWNER_CANONICAL_KEYS, *_OWNER_ALIAS_KEYS, "sys_owner", "svc_owner", "system_owner_display", "service_owner_display")):
        return payload, False
    sanitized = dict(payload)

    # Normalize common frontend alias keys (system_owner/service_owner) onto canonical columns.
    # Frontend pages use these keys to submit emp_no values and explicit nulls for clearing.
    alias_pairs = (
        ("system_owner_emp_no", "system_owner"),
        ("service_owner_emp_no", "service_owner"),
        ("system_owner_emp_no", "sys_owner"),
        ("service_owner_emp_no", "svc_owner"),
    )
    for canonical, alias in alias_pairs:
        if canonical in sanitized:
            continue
        if alias not in sanitized:
            continue
        v = sanitized.get(alias)
        # Keep explicit nulls (used to clear the selection).
        if v is None:
            sanitized[canonical] = None
            continue
        text_val = str(v).strip()
        if text_val == "":
            # Treat empty strings as clearing.
            sanitized[canonical] = None
            continue
        sanitized[canonical] = text_val

    # IMPORTANT:
    # - When FK enforcement is available, owner columns should store emp_no values only.
    #   Do NOT copy display names into FK columns.
    # - When FK enforcement is not available (legacy DBs), we allow a text fallback.
    fallback_pairs = (
        ("system_owner_emp_no", "system_owner_display"),
        ("service_owner_emp_no", "service_owner_display"),
    )
    owner_text_mode = False
    if not allow_owner_fk:
        for canonical, helper in fallback_pairs:
            helper_value = (sanitized.get(helper) or "").strip()
            if helper_value and not sanitized.get(canonical):
                sanitized[canonical] = helper_value
                owner_text_mode = True

    # Keep system_owner_display/service_owner_display: these are persisted as snapshot
    # display values on the hardware table.
    for key in _OWNER_ALIAS_KEYS:
        sanitized.pop(key, None)
    for key in ("sys_owner", "svc_owner"):
        sanitized.pop(key, None)

    # If the emp_no is explicitly cleared, clear display too.
    for emp_key, disp_key in (
        ("system_owner_emp_no", "system_owner_display"),
        ("service_owner_emp_no", "service_owner_display"),
    ):
        if emp_key in sanitized and sanitized.get(emp_key) is None:
            sanitized[disp_key] = None
    return sanitized, owner_text_mode


def _hydrate_owner_displays(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort: fill owner display names from org_user when missing.

    Frontend usually submits both emp_no and display name. This keeps API robust
    for older clients and ensures a human-readable name is persisted when possible.
    """

    if not _owner_table_available(conn):
        return payload
    out = dict(payload)
    for emp_key, disp_key in (
        ("system_owner_emp_no", "system_owner_display"),
        ("service_owner_emp_no", "service_owner_display"),
    ):
        if emp_key not in out:
            continue
        emp_raw = out.get(emp_key)
        if emp_raw is None:
            if disp_key in out:
                out[disp_key] = None
            continue
        emp_no = str(emp_raw).strip()
        if not emp_no:
            out[emp_key] = None
            out[disp_key] = None
            continue

        disp_raw = out.get(disp_key)
        disp = (str(disp_raw).strip() if disp_raw is not None else "")
        if disp and disp != emp_no:
            continue

        try:
            row = conn.execute(
                "SELECT name FROM org_user WHERE emp_no = ? AND is_deleted = 0 LIMIT 1",
                (emp_no,),
            ).fetchone()
            name = (row["name"] or "").strip() if row else ""
        except Exception:
            name = ""
        if name:
            out[disp_key] = name
        elif disp_key not in out:
            out[disp_key] = emp_no
    return out


def _diagnose_fk_failure(conn: sqlite3.Connection, payload: Dict[str, Any]) -> List[str]:
    """Best-effort FK diagnostics for SQLite's generic 'foreign key constraint failed'."""

    fk_specs = (
        ("work_category_code", "biz_work_category", "category_code", "업무 분류"),
        ("work_division_code", "biz_work_division", "division_code", "업무 구분"),
        ("work_status_code", "biz_work_status", "status_code", "업무 상태"),
        ("work_operation_code", "biz_work_operation", "operation_code", "업무 운영"),
        ("work_group_code", "biz_work_group", "group_code", "업무 그룹"),
        ("manufacturer_code", "biz_vendor_manufacturer", "manufacturer_code", "시스템 제조사"),
        ("server_code", "hw_server_type", "server_code", "시스템 모델"),
        ("center_code", "org_center", "center_code", "시스템 장소"),
        ("rack_code", "org_rack", "rack_code", "시스템 위치"),
        ("system_dept_code", "org_department", "dept_code", "시스템 담당부서"),
        ("service_dept_code", "org_department", "dept_code", "서비스 담당부서"),
        ("system_owner_emp_no", "org_user", "emp_no", "시스템 담당자"),
        ("service_owner_emp_no", "org_user", "emp_no", "서비스 담당자"),
    )

    missing: List[str] = []
    for col, ref_table, ref_col, label in fk_specs:
        raw = payload.get(col)
        if raw is None:
            continue
        value = str(raw).strip()
        if not value:
            continue
        try:
            row = conn.execute(
                f"SELECT 1 FROM {ref_table} WHERE {ref_col} = ? LIMIT 1",
                (value,),
            ).fetchone()
        except Exception:
            # If the target table/column isn't queryable in this DB snapshot, skip.
            continue
        if row is None:
            missing.append(f"{label}({col})='{value}'")
    return missing


def _bool_flag(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return 1 if value else 0
    text = str(value).strip()
    if text in BOOLEAN_STRINGS[True]:
        return 1
    if text in BOOLEAN_STRINGS[False]:
        return 0
    if text.isdigit():
        return 1 if int(text) > 0 else 0
    return default


def _random_fragment(length: int = 6) -> str:
    bytes_len = max(1, (length + 1) // 2)
    return secrets.token_hex(bytes_len)[:length].upper()


def _asset_code_exists(conn: sqlite3.Connection, asset_code: str) -> bool:
    if not asset_code:
        return False
    cur = conn.execute(
        f"SELECT 1 FROM {TABLE_NAME} WHERE asset_code = ? LIMIT 1",
        (asset_code,),
    )
    return cur.fetchone() is not None


def _ensure_unique_asset_code(conn: sqlite3.Connection, proposed_code: str) -> str:
    base = (proposed_code or "").strip()
    if not base:
        base = f"AUTO-{_random_fragment(8)}"
    candidate = base
    attempts = 0
    while _asset_code_exists(conn, candidate):
        attempts += 1
        candidate = f"{base}-{_random_fragment(4)}"
        if attempts % 5 == 0:
            base = f"AUTO-{_random_fragment(8)}"
            candidate = base
    return candidate


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    keys = set(row.keys())
    return {
        "id": row["id"],
        "asset_category": row["asset_category"],
        "asset_type": row["asset_type"],
        "asset_code": row["asset_code"],
        "asset_name": row["asset_name"],
        "work_type_code": row["work_category_code"],
        "work_type_name": row["work_category_name"],
        "work_category_code": row["work_division_code"],
        "work_category_name": row["work_division_name"],
        "work_status_code": row["work_status_code"],
        "work_status_name": row["work_status_name"],
        "work_status_color": row["work_status_color"],
        "work_operation_code": row["work_operation_code"],
        "work_operation_name": row["work_operation_name"],
        "work_group_code": row["work_group_code"],
        "work_group_name": row["work_group_name"],
        "work_name": row["work_name"],
        "system_name": row["system_name"],
        "system_ip": row["system_ip"],
        "mgmt_ip": row["mgmt_ip"],
        "manufacturer_code": row["manufacturer_code"],
        "manufacturer_name": row["manufacturer_name"],
        "server_code": row["server_code"],
        "server_model_name": row["model_name"],
        "serial_number": row["serial_number"],
        "serial": row["serial_number"],
        "center_code": row["center_code"],
        "center_name": row["center_name"],
        "rack_code": row["rack_code"],
        "rack_name": row["rack_name"],
        "slot": row["system_slot"],
        "u_size": row["system_size"],
        "rack_face": row["rack_face"] if "rack_face" in keys else "FRONT",
        "system_dept_code": row["system_dept_code"],
        "system_dept_name": row["system_dept_name"],
        "system_owner_emp_no": row["system_owner_emp_no"],
        "system_owner_display": row["system_owner_name"]
        or (row["system_owner_display"] if "system_owner_display" in keys else None)
        or row["system_owner_emp_no"],
        "system_owner_name": row["system_owner_name"]
        or (row["system_owner_display"] if "system_owner_display" in keys else None)
        or row["system_owner_emp_no"],
        "service_dept_code": row["service_dept_code"],
        "service_dept_name": row["service_dept_name"],
        "service_owner_emp_no": row["service_owner_emp_no"],
        "service_owner_display": row["service_owner_name"]
        or (row["service_owner_display"] if "service_owner_display" in keys else None)
        or row["service_owner_emp_no"],
        "service_owner_name": row["service_owner_name"]
        or (row["service_owner_display"] if "service_owner_display" in keys else None)
        or row["service_owner_emp_no"],
        "virtualization_type": row["virtualization_type"],
        "cia_confidentiality": row["cia_confidentiality"],
        "cia_integrity": row["cia_integrity"],
        "cia_availability": row["cia_availability"],
        "security_score": row["security_score"],
        "system_grade": row["system_grade"],
        "is_core_system": row["is_core_system"],
        "has_dr_site": row["has_dr_site"],
        "has_service_ha": row["has_service_ha"],
        "service_ha_type": row["service_ha_type"],
        "tpmc_total": row["tpmc_total"] if "tpmc_total" in keys else None,
        "tpmc_managed": row["tpmc_managed"] if "tpmc_managed" in keys else None,
        "tpmc_updated_at": row["tpmc_updated_at"] if "tpmc_updated_at" in keys else None,
        "created_at": row["created_at"],
        "created_by": row["created_by"],
        "updated_at": row["updated_at"],
        "updated_by": row["updated_by"],
    }


def _apply_aliases(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    for alias, canonical in _CODE_ALIAS_MAP.items():
        if alias in payload and canonical not in payload:
            payload[canonical] = payload[alias]
    return payload


def list_hardware_assets(
    *,
    app=None,
    asset_category: str = "SERVER",
    asset_type: Optional[Any] = "ON_PREMISE",
    search: Optional[str] = None,
    filters: Optional[Dict[str, Any]] = None,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    app = app or current_app
    filters = filters or {}
    page = max(1, page)
    page_size = max(1, min(200, page_size))
    offset = (page - 1) * page_size
    base_where = ["ha.is_deleted = 0", "ha.is_disposed = 0"]
    params: List[Any] = []
    if asset_category:
        base_where.append("ha.asset_category = ?")
        params.append(asset_category)
    if asset_type:
        if isinstance(asset_type, str):
            token = asset_type.strip()
            if token:
                base_where.append("ha.asset_type = ?")
                params.append(token)
        else:
            tokens = [str(t).strip() for t in asset_type if str(t).strip()]
            if tokens:
                placeholders = ",".join("?" for _ in tokens)
                base_where.append(f"ha.asset_type IN ({placeholders})")
                params.extend(tokens)
    for column in (
        "work_category_code",
        "work_division_code",
        "work_status_code",
        "work_operation_code",
        "work_group_code",
    ):
        value = filters.get(column)
        if value:
            base_where.append(f"ha.{column} = ?")
            params.append(value)

    rack_code = (filters.get("rack_code") or "").strip()
    if rack_code:
        base_where.append("ha.rack_code = ?")
        params.append(rack_code)

    work_name = (filters.get("work_name") or "").strip()
    if work_name:
        base_where.append("ha.work_name LIKE ?")
        params.append(f"%{work_name}%")
    system_name = (filters.get("system_name") or "").strip()
    if system_name:
        base_where.append("ha.system_name LIKE ?")
        params.append(f"%{system_name}%")
    if search:
        token = f"%{search.strip()}%"
        base_where.append(
            "("
            "ha.asset_code LIKE ? OR ha.asset_name LIKE ? OR ha.work_name LIKE ? OR ha.system_name LIKE ? OR ha.system_ip LIKE ? OR ha.mgmt_ip LIKE ? "
            "OR ha.manufacturer_code LIKE ? OR ha.server_code LIKE ? "
            "OR ha.manufacturer_code IN (SELECT manufacturer_code FROM biz_vendor_manufacturer WHERE manufacturer_name LIKE ?) "
            "OR ha.server_code IN (SELECT server_code FROM hw_server_type WHERE model_name LIKE ?)"
            ")"
        )
        params.extend([token, token, token, token, token, token, token, token, token, token])
    where_clause = " AND ".join(base_where)
    count_sql = f"SELECT COUNT(1) FROM {TABLE_NAME} ha WHERE {where_clause}"
    with _get_connection(app) as conn:
        owner_select_clause, owner_join_clause = _owner_join_fragments(conn)
        select_sql = f"""
        SELECT
            ha.*,
            bwc.category_name AS work_category_name,
            bwd.division_name AS work_division_name,
            bws.status_name AS work_status_name,
            bws.status_level AS work_status_color,
            bwo.operation_name AS work_operation_name,
            bwg.group_name AS work_group_name,
            bvm.manufacturer_name,
            hst.model_name,
            oc.center_name,
            COALESCE(orack.rack_position, orack.rack_code) AS rack_name,
            sys_dept.dept_name AS system_dept_name,
            svc_dept.dept_name AS service_dept_name,{owner_select_clause}
        FROM {TABLE_NAME} ha
        LEFT JOIN biz_work_category bwc ON bwc.category_code = ha.work_category_code
        LEFT JOIN biz_work_division bwd ON bwd.division_code = ha.work_division_code
        LEFT JOIN biz_work_status bws ON bws.status_code = ha.work_status_code
        LEFT JOIN biz_work_operation bwo ON bwo.operation_code = ha.work_operation_code
        LEFT JOIN biz_work_group bwg ON bwg.group_code = ha.work_group_code
        LEFT JOIN biz_vendor_manufacturer bvm ON bvm.manufacturer_code = ha.manufacturer_code
        LEFT JOIN hw_server_type hst ON hst.server_code = ha.server_code
        LEFT JOIN org_center oc ON oc.center_code = ha.center_code
        LEFT JOIN org_rack orack ON orack.rack_code = ha.rack_code
        LEFT JOIN org_department sys_dept ON sys_dept.dept_code = ha.system_dept_code
        LEFT JOIN org_department svc_dept ON svc_dept.dept_code = ha.service_dept_code{owner_join_clause}
        WHERE {where_clause}
        ORDER BY ha.id DESC
        LIMIT ? OFFSET ?
        """
        rows = conn.execute(select_sql, (*params, page_size, offset)).fetchall()
        total = conn.execute(count_sql, params).fetchone()[0]
    return {
        "items": [_row_to_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_hardware_asset(
    asset_id: int,
    app=None,
    *,
    asset_category: Optional[str] = None,
    asset_type: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        owner_select_clause, owner_join_clause = _owner_join_fragments(conn)
        where_clauses = ["ha.id = ?", "ha.is_deleted = 0", "ha.is_disposed = 0"]
        params: List[Any] = [asset_id]
        if asset_category:
            where_clauses.append("ha.asset_category = ?")
            params.append(asset_category)
        if asset_type:
            if isinstance(asset_type, str):
                token = asset_type.strip()
                if token:
                    where_clauses.append("ha.asset_type = ?")
                    params.append(token)
            else:
                tokens = [str(t).strip() for t in asset_type if str(t).strip()]
                if tokens:
                    placeholders = ",".join("?" for _ in tokens)
                    where_clauses.append(f"ha.asset_type IN ({placeholders})")
                    params.extend(tokens)
        where_clause = " AND ".join(where_clauses)
        select_sql = f"""
        SELECT
            ha.*,
            bwc.category_name AS work_category_name,
            bwd.division_name AS work_division_name,
            bws.status_name AS work_status_name,
            bws.status_level AS work_status_color,
            bwo.operation_name AS work_operation_name,
            bwg.group_name AS work_group_name,
            bvm.manufacturer_name,
            hst.model_name,
            oc.center_name,
            COALESCE(orack.rack_position, orack.rack_code) AS rack_name,
            sys_dept.dept_name AS system_dept_name,
            svc_dept.dept_name AS service_dept_name,{owner_select_clause}
        FROM {TABLE_NAME} ha
        LEFT JOIN biz_work_category bwc ON bwc.category_code = ha.work_category_code
        LEFT JOIN biz_work_division bwd ON bwd.division_code = ha.work_division_code
        LEFT JOIN biz_work_status bws ON bws.status_code = ha.work_status_code
        LEFT JOIN biz_work_operation bwo ON bwo.operation_code = ha.work_operation_code
        LEFT JOIN biz_work_group bwg ON bwg.group_code = ha.work_group_code
        LEFT JOIN biz_vendor_manufacturer bvm ON bvm.manufacturer_code = ha.manufacturer_code
        LEFT JOIN hw_server_type hst ON hst.server_code = ha.server_code
        LEFT JOIN org_center oc ON oc.center_code = ha.center_code
        LEFT JOIN org_rack orack ON orack.rack_code = ha.rack_code
        LEFT JOIN org_department sys_dept ON sys_dept.dept_code = ha.system_dept_code
        LEFT JOIN org_department svc_dept ON svc_dept.dept_code = ha.service_dept_code{owner_join_clause}
        WHERE {where_clause}
        """
        row = conn.execute(select_sql, params).fetchone()
        return _row_to_dict(row) if row else None


def _prepare_payload(data: Dict[str, Any], *, actor: str, for_update: bool = False) -> Tuple[List[str], List[Any]]:
    payload = _apply_aliases(data)

    def _is_empty(value: Any) -> bool:
        if value is None:
            return True
        if isinstance(value, str) and not value.strip():
            return True
        return False

    def _to_int(value: Any) -> Optional[int]:
        if value is None:
            return None
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            try:
                return int(value)
            except Exception:
                return None
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            try:
                return int(s)
            except Exception:
                return None
        return None

    def _normalize_value(key: str, value: Any) -> Any:
        """Normalize UI payload values for DB storage.

        - Treat blank strings as NULL (prevents FK constraint failures on optional selects).
        - Coerce integer-like fields to int/NULL.
        """
        if key in {
            "system_slot",
            "system_size",
            "cia_confidentiality",
            "cia_integrity",
            "cia_availability",
            "security_score",
        }:
            return _to_int(value)
        if key == "rack_face":
            v = (str(value).strip().upper() if value else "FRONT")
            return v if v in ("FRONT", "REAR") else "FRONT"
        if _is_empty(value):
            return None
        return value

    # CIA -> security score / grade (server-side fallback).
    # If UI only sends CIA values, compute score/grade; if CIA is cleared, clear score/grade too.
    if any(k in payload for k in ("cia_confidentiality", "cia_integrity", "cia_availability")):
        c = _to_int(payload.get("cia_confidentiality"))
        i = _to_int(payload.get("cia_integrity"))
        a = _to_int(payload.get("cia_availability"))

        if c is None or i is None or a is None:
            if "security_score" not in payload:
                payload["security_score"] = None
            if "system_grade" not in payload:
                payload["system_grade"] = None
        else:
            total = c + i + a
            if "security_score" not in payload or _is_empty(payload.get("security_score")):
                payload["security_score"] = total
            if "system_grade" not in payload or _is_empty(payload.get("system_grade")):
                if total >= 8:
                    payload["system_grade"] = "1등급"
                elif total >= 6:
                    payload["system_grade"] = "2등급"
                elif total > 0:
                    payload["system_grade"] = "3등급"
                else:
                    payload["system_grade"] = None

    columns: List[str] = []
    params: List[Any] = []
    mappings = (
        "asset_category",
        "asset_type",
        "asset_code",
        "asset_name",
        "work_category_code",
        "work_division_code",
        "work_status_code",
        "work_operation_code",
        "work_group_code",
        "work_name",
        "system_name",
        "system_ip",
        "mgmt_ip",
        "manufacturer_code",
        "server_code",
        "serial_number",
        "firmware",
        "center_code",
        "rack_code",
        "system_slot",
        "system_size",
        "rack_face",
        "system_dept_code",
        "system_owner_emp_no",
        "system_owner_display",
        "service_dept_code",
        "service_owner_emp_no",
        "service_owner_display",
        "virtualization_type",
        "cia_confidentiality",
        "cia_integrity",
        "cia_availability",
        "security_score",
        "system_grade",
        "service_ha_type",
    )
    for key in mappings:
        if key in payload:
            columns.append(key)
            params.append(_normalize_value(key, payload[key]))

        # NOTE: allow explicit clears (NULL) when UI sends empty/null.
        if "core_flag" in payload and "is_core_system" not in payload:
            if _is_empty(payload.get("core_flag")):
                payload["is_core_system"] = None
            else:
                payload["is_core_system"] = 1 if str(payload["core_flag"]).strip() == "핵심" else 0
        if "dr_built" in payload and "has_dr_site" not in payload:
            if _is_empty(payload.get("dr_built")):
                payload["has_dr_site"] = None
            else:
                payload["has_dr_site"] = 1 if str(payload["dr_built"]).strip().upper() == "O" else 0
        if "svc_redundancy" in payload and "has_service_ha" not in payload:
            if _is_empty(payload.get("svc_redundancy")):
                payload["has_service_ha"] = None
            else:
                payload["has_service_ha"] = 1 if str(payload["svc_redundancy"]).strip().upper() == "O" else 0
    for bool_key, column in (
        ("is_core_system", "is_core_system"),
        ("has_dr_site", "has_dr_site"),
        ("has_service_ha", "has_service_ha"),
    ):
        if bool_key in payload:
            raw = payload.get(bool_key)
            if raw is None or (isinstance(raw, str) and raw.strip() == ""):
                columns.append(column)
                params.append(None)
            else:
                columns.append(column)
                params.append(_bool_flag(raw))
    timestamp = _now()
    if for_update:
        columns.extend(["updated_at", "updated_by"])
        params.extend([timestamp, actor])
    else:
        columns.extend(["created_at", "created_by", "updated_at", "updated_by", "is_deleted"])
        params.extend([timestamp, actor, timestamp, actor, 0])
    return columns, params


def _check_slot_uniqueness(
    conn: sqlite3.Connection,
    data: Dict[str, Any],
    exclude_id: Optional[int] = None,
) -> None:
    """Raise ValueError if (center_code, rack_code, system_slot, rack_face) already taken."""
    aliased = _apply_aliases(data)
    center = (aliased.get("center_code") or "").strip()
    rack = (aliased.get("rack_code") or "").strip()
    slot_raw = aliased.get("system_slot")
    face = (aliased.get("rack_face") or "FRONT").strip().upper()
    if not center or not rack or slot_raw is None:
        return
    try:
        slot = int(slot_raw)
    except (TypeError, ValueError):
        return
    sql = (
        f"SELECT id FROM {TABLE_NAME} "
        "WHERE center_code = ? AND rack_code = ? AND system_slot = ? AND rack_face = ? "
        "AND is_deleted = 0"
    )
    params: list = [center, rack, slot, face]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    sql += " LIMIT 1"
    row = conn.execute(sql, params).fetchone()
    if row:
        side = "전면" if face == "FRONT" else "후면"
        raise ValueError(
            f"동일한 RACK 위치에 이미 장비가 있습니다 (슬롯 {slot}, {side}). 다른 슬롯을 선택해 주세요."
        )


def create_hardware_asset(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or "system").strip() or "system"
    asset_category = data.get("asset_category") or "SERVER"
    asset_type = data.get("asset_type") or "ON_PREMISE"
    asset_code = (data.get("asset_code") or "").strip()
    asset_name = (data.get("asset_name") or "").strip()
    if not asset_code:
        raise ValueError("asset_code is required")
    if not asset_name:
        raise ValueError("asset_name is required")
    base_payload = dict(data)
    base_payload["asset_category"] = asset_category
    base_payload["asset_type"] = asset_type
    requested_code = asset_code
    with _get_connection(app) as conn:
        def _maybe_backfill_server_type_from_security(code: str) -> None:
            """If `code` is a security model, ensure it exists in hw_server_type.

            Security asset pages submit `model` which maps to hardware.server_code and
            has an FK to hw_server_type(server_code). In fresh DBs or when a user types
            a model code directly, hw_server_type may be missing the row even though
            hw_security_type has it.
            """

            token = (code or "").strip()
            if not token:
                return

            try:
                exists = conn.execute(
                    "SELECT 1 FROM hw_server_type WHERE server_code = ? AND is_deleted = 0 LIMIT 1",
                    (token,),
                ).fetchone()
                if exists:
                    return

                row = conn.execute(
                    "SELECT security_code, model_name, manufacturer_code, security_type, release_date, eosl_date, remark "
                    "FROM hw_security_type WHERE security_code = ? AND is_deleted = 0 LIMIT 1",
                    (token,),
                ).fetchone()
                if not row:
                    return

                security_type = (row["security_type"] or "").strip()
                upper = security_type.upper()
                if upper in {"FW", "VPN", "IDS", "IPS", "HSM", "KMS", "WIPS", "ETC"}:
                    form_factor = upper
                else:
                    lowered = security_type.lower()
                    if lowered in {"방화벽", "firewall"}:
                        form_factor = "FW"
                    elif lowered == "vpn":
                        form_factor = "VPN"
                    elif lowered in {"ids", "침입탐지", "침입 탐지"}:
                        form_factor = "IDS"
                    elif lowered in {"ips", "침입방지", "침입 방지"}:
                        form_factor = "IPS"
                    else:
                        form_factor = "ETC"

                timestamp = _now()
                conn.execute(
                    """
                    INSERT OR IGNORE INTO hw_server_type
                        (server_code, model_name, manufacturer_code, form_factor,
                         release_date, eosl_date, server_count, remark,
                         created_at, created_by, updated_at, updated_by, is_deleted)
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        (row["security_code"] or "").strip()[:60],
                        (row["model_name"] or "").strip() or token,
                        (row["manufacturer_code"] or "").strip(),
                        form_factor,
                        row["release_date"],
                        row["eosl_date"],
                        row["remark"],
                        timestamp,
                        actor,
                        timestamp,
                        actor,
                    ),
                )
                # If the row existed but was soft-deleted or outdated, refresh it.
                conn.execute(
                    """
                    UPDATE hw_server_type
                       SET model_name = ?,
                           manufacturer_code = ?,
                           form_factor = ?,
                           is_deleted = 0,
                           updated_at = ?,
                           updated_by = ?
                     WHERE server_code = ?
                    """,
                    (
                        (row["model_name"] or "").strip() or token,
                        (row["manufacturer_code"] or "").strip(),
                        form_factor,
                        timestamp,
                        actor,
                        (row["security_code"] or "").strip()[:60],
                    ),
                )
            except Exception:
                # Never block asset creation due to best-effort backfill.
                logger.exception("Failed to backfill hw_server_type from hw_security_type")

        owner_allowed = _owner_table_available(conn)
        payload_template, owner_text_mode = _normalize_owner_payload(base_payload, owner_allowed)
        payload_template = _hydrate_owner_displays(conn, payload_template)

        # Avoid DB defaults forcing optional booleans to 0.
        # If the UI did not explicitly set these, store NULL so the UI can render "-".
        if (
            "has_dr_site" not in payload_template
            and "dr_built" not in payload_template
            and "has_dr_site" not in base_payload
            and "dr_built" not in base_payload
        ):
            payload_template["has_dr_site"] = None
        if (
            "has_service_ha" not in payload_template
            and "svc_redundancy" not in payload_template
            and "has_service_ha" not in base_payload
            and "svc_redundancy" not in base_payload
        ):
            payload_template["has_service_ha"] = None

        # Best-effort: if this is a security asset, ensure selected model exists in hw_server_type.
        if str(asset_category).strip().upper() == "SECURITY":
            model_code = payload_template.get("server_code") or payload_template.get("model")
            _maybe_backfill_server_type_from_security(str(model_code or ""))

        _check_slot_uniqueness(conn, base_payload)

        fk_disabled = False
        if not owner_allowed or owner_text_mode:
            conn.execute("PRAGMA foreign_keys = OFF;")
            fk_disabled = True
        try:
            max_attempts = 5
            last_error: Optional[Exception] = None
            for attempt in range(1, max_attempts + 1):
                candidate_code = _ensure_unique_asset_code(conn, asset_code)
                if candidate_code != requested_code:
                    logger.info(
                        "asset_code collision detected. requested=%s, substituted=%s (attempt=%s)",
                        requested_code,
                        candidate_code,
                        attempt,
                    )
                payload = dict(payload_template)
                payload["asset_code"] = candidate_code
                columns, params = _prepare_payload(payload, actor=actor, for_update=False)
                placeholders = ", ".join("?" for _ in columns)
                sql = f"INSERT INTO {TABLE_NAME} ({', '.join(columns)}) VALUES ({placeholders})"
                try:
                    conn.execute(sql, params)
                    asset_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                    conn.commit()
                    return get_hardware_asset(
                        asset_id,
                        app=app,
                        asset_category=asset_category,
                        asset_type=asset_type,
                    ) or {}
                except sqlite3.IntegrityError as exc:
                    conn.rollback()
                    last_error = exc
                    msg_l = str(exc).lower() if exc is not None else ""
                    if "foreign key constraint failed" in msg_l:
                        missing = _diagnose_fk_failure(conn, dict(zip(columns, params)))
                        if missing:
                            raise ValueError(
                                "선택한 값이 마스터 데이터에 없어 저장할 수 없습니다: " + ", ".join(missing)
                            )
                        raise ValueError(
                            "선택한 값(업무/조직/장비/위치 등)이 마스터 데이터에 없어 저장할 수 없습니다. "
                            "목록을 새로고침 후 다시 선택해 주세요."
                        )
                    if "asset_code" not in str(exc):
                        raise
                    logger.warning(
                        "IntegrityError on asset_code insertion (attempt=%s): %s", attempt, exc
                    )
                    asset_code = f"{candidate_code}-{_random_fragment(4)}"
            if last_error:
                raise last_error
        finally:
            if fk_disabled:
                conn.execute("PRAGMA foreign_keys = ON;")
    raise RuntimeError("Failed to create hardware asset after multiple attempts")


def update_hardware_asset(
    asset_id: int,
    data: Dict[str, Any],
    actor: str,
    app=None,
    *,
    asset_category: Optional[str] = None,
    asset_type: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or "system").strip() or "system"
    if not data:
        return get_hardware_asset(
            asset_id,
            app=app,
            asset_category=asset_category,
            asset_type=asset_type,
        )
    with _get_connection(app) as conn:
        def _maybe_backfill_server_type_from_security(code: str) -> None:
            token = (code or "").strip()
            if not token:
                return
            try:
                exists = conn.execute(
                    "SELECT 1 FROM hw_server_type WHERE server_code = ? AND is_deleted = 0 LIMIT 1",
                    (token,),
                ).fetchone()
                if exists:
                    return
                row = conn.execute(
                    "SELECT security_code, model_name, manufacturer_code, security_type, release_date, eosl_date, remark "
                    "FROM hw_security_type WHERE security_code = ? AND is_deleted = 0 LIMIT 1",
                    (token,),
                ).fetchone()
                if not row:
                    return
                security_type = (row["security_type"] or "").strip()
                upper = security_type.upper()
                if upper in {"FW", "VPN", "IDS", "IPS", "HSM", "KMS", "WIPS", "ETC"}:
                    form_factor = upper
                else:
                    lowered = security_type.lower()
                    if lowered in {"방화벽", "firewall"}:
                        form_factor = "FW"
                    elif lowered == "vpn":
                        form_factor = "VPN"
                    elif lowered in {"ids", "침입탐지", "침입 탐지"}:
                        form_factor = "IDS"
                    elif lowered in {"ips", "침입방지", "침입 방지"}:
                        form_factor = "IPS"
                    else:
                        form_factor = "ETC"
                timestamp = _now()
                conn.execute(
                    """
                    INSERT OR IGNORE INTO hw_server_type
                        (server_code, model_name, manufacturer_code, form_factor,
                         release_date, eosl_date, server_count, remark,
                         created_at, created_by, updated_at, updated_by, is_deleted)
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        (row["security_code"] or "").strip()[:60],
                        (row["model_name"] or "").strip() or token,
                        (row["manufacturer_code"] or "").strip(),
                        form_factor,
                        row["release_date"],
                        row["eosl_date"],
                        row["remark"],
                        timestamp,
                        actor,
                        timestamp,
                        actor,
                    ),
                )
                conn.execute(
                    """
                    UPDATE hw_server_type
                       SET model_name = ?,
                           manufacturer_code = ?,
                           form_factor = ?,
                           is_deleted = 0,
                           updated_at = ?,
                           updated_by = ?
                     WHERE server_code = ?
                    """,
                    (
                        (row["model_name"] or "").strip() or token,
                        (row["manufacturer_code"] or "").strip(),
                        form_factor,
                        timestamp,
                        actor,
                        (row["security_code"] or "").strip()[:60],
                    ),
                )
            except Exception:
                logger.exception("Failed to backfill hw_server_type from hw_security_type")

        owner_allowed = _owner_table_available(conn)
        payload, owner_text_mode = _normalize_owner_payload(data, owner_allowed)
        payload = _hydrate_owner_displays(conn, payload)

        effective_asset_category = (asset_category or payload.get("asset_category") or "").strip().upper()
        if effective_asset_category == "SECURITY":
            model_code = payload.get("server_code") or payload.get("model")
            _maybe_backfill_server_type_from_security(str(model_code or ""))

        # Slot uniqueness: merge existing row values with incoming update
        cur_row = conn.execute(
            f"SELECT center_code, rack_code, system_slot, rack_face FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (asset_id,),
        ).fetchone()
        if cur_row:
            merged = {
                "center_code": payload.get("center_code", cur_row["center_code"]),
                "rack_code": payload.get("rack_code", cur_row["rack_code"]),
                "system_slot": payload.get("system_slot", cur_row["system_slot"]),
                "rack_face": payload.get("rack_face", cur_row["rack_face"]),
            }
            _check_slot_uniqueness(conn, merged, exclude_id=asset_id)

        fk_disabled = False
        if not owner_allowed or owner_text_mode:
            conn.execute("PRAGMA foreign_keys = OFF;")
            fk_disabled = True
        columns, params = _prepare_payload(payload, actor=actor, for_update=True)
        if not columns:
            return get_hardware_asset(
                asset_id,
                app=app,
                asset_category=asset_category,
                asset_type=asset_type,
            )
        assignments = ", ".join(f"{col} = ?" for col in columns)
        where_parts = ["id = ?", "is_deleted = 0"]
        where_params: List[Any] = [asset_id]
        if asset_category:
            where_parts.append("asset_category = ?")
            where_params.append(asset_category)
        if asset_type:
            if isinstance(asset_type, str):
                token = asset_type.strip()
                if token:
                    where_parts.append("asset_type = ?")
                    where_params.append(token)
            else:
                tokens = [str(t).strip() for t in asset_type if str(t).strip()]
                if tokens:
                    placeholders = ",".join("?" for _ in tokens)
                    where_parts.append(f"asset_type IN ({placeholders})")
                    where_params.extend(tokens)
        where_clause = " AND ".join(where_parts)
        sql = f"UPDATE {TABLE_NAME} SET {assignments} WHERE {where_clause}"
        try:
            cur = conn.execute(sql, (*params, *where_params))
            if cur.rowcount == 0:
                return None
            conn.commit()
        except sqlite3.IntegrityError as exc:
            conn.rollback()
            msg_l = str(exc).lower() if exc is not None else ""
            if "foreign key constraint failed" in msg_l:
                missing = _diagnose_fk_failure(conn, dict(zip(columns, params)))
                if missing:
                    raise ValueError(
                        "선택한 값이 마스터 데이터에 없어 저장할 수 없습니다: " + ", ".join(missing)
                    )
                raise ValueError(
                    "선택한 값(업무/조직/장비/위치 등)이 마스터 데이터에 없어 저장할 수 없습니다. "
                    "목록을 새로고침 후 다시 선택해 주세요."
                )
            raise
        finally:
            if fk_disabled:
                conn.execute("PRAGMA foreign_keys = ON;")
    # If asset_type was changed in the payload, use the new value for the fetch
    fetch_asset_type = payload.get("asset_type", asset_type) or asset_type
    return get_hardware_asset(
        asset_id,
        app=app,
        asset_category=asset_category,
        asset_type=fetch_asset_type,
    )


def soft_delete_hardware_assets(
    ids: Sequence[Any],
    actor: str,
    app=None,
    *,
    asset_category: Optional[str] = None,
    asset_type: Optional[Any] = None,
) -> int:
    app = app or current_app
    actor = (actor or "system").strip() or "system"
    numeric_ids = [int(i) for i in ids if str(i).isdigit()]
    if not numeric_ids:
        return 0
    placeholders = ",".join("?" for _ in numeric_ids)
    conditions = [f"id IN ({placeholders})", "is_deleted = 0"]
    params: List[Any] = [*numeric_ids]
    if asset_category:
        conditions.append("asset_category = ?")
        params.append(asset_category)
    if asset_type:
        if isinstance(asset_type, str):
            token = asset_type.strip()
            if token:
                conditions.append("asset_type = ?")
                params.append(token)
        else:
            tokens = [str(t).strip() for t in asset_type if str(t).strip()]
            if tokens:
                placeholders = ",".join("?" for _ in tokens)
                conditions.append(f"asset_type IN ({placeholders})")
                params.extend(tokens)
    where_clause = " AND ".join(conditions)
    sql = f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE {where_clause}"
    timestamp = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(sql, (timestamp, actor, *params))
        conn.commit()
        return cur.rowcount


def dispose_hardware_assets(
    ids: Sequence[Any],
    actor: str,
    app=None,
    *,
    asset_category: Optional[str] = None,
    asset_type: Optional[Any] = None,
) -> int:
    """Mark hardware assets as disposed (불용처리)."""
    app = app or current_app
    actor = (actor or "system").strip() or "system"
    numeric_ids = [int(i) for i in ids if str(i).isdigit()]
    if not numeric_ids:
        return 0
    placeholders = ",".join("?" for _ in numeric_ids)
    conditions = [f"id IN ({placeholders})", "is_deleted = 0", "is_disposed = 0"]
    params: List[Any] = [*numeric_ids]
    if asset_category:
        conditions.append("asset_category = ?")
        params.append(asset_category)
    if asset_type:
        if isinstance(asset_type, str):
            token = asset_type.strip()
            if token:
                conditions.append("asset_type = ?")
                params.append(token)
        else:
            tokens = [str(t).strip() for t in asset_type if str(t).strip()]
            if tokens:
                ph = ",".join("?" for _ in tokens)
                conditions.append(f"asset_type IN ({ph})")
                params.extend(tokens)
    where_clause = " AND ".join(conditions)
    timestamp = _now()
    sql = f"UPDATE {TABLE_NAME} SET is_disposed = 1, disposed_at = ?, disposed_by = ?, updated_at = ?, updated_by = ? WHERE {where_clause}"
    with _get_connection(app) as conn:
        cur = conn.execute(sql, (timestamp, actor, timestamp, actor, *params))
        conn.commit()
        return cur.rowcount


def restore_disposed_hardware_assets(
    ids: Sequence[Any],
    actor: str,
    app=None,
    *,
    asset_category: Optional[str] = None,
) -> int:
    """Restore disposed assets back to normal (자산편입)."""
    app = app or current_app
    actor = (actor or "system").strip() or "system"
    numeric_ids = [int(i) for i in ids if str(i).isdigit()]
    if not numeric_ids:
        return 0
    placeholders = ",".join("?" for _ in numeric_ids)
    conditions = [f"id IN ({placeholders})", "is_deleted = 0", "is_disposed = 1"]
    params: List[Any] = [*numeric_ids]
    if asset_category:
        conditions.append("asset_category = ?")
        params.append(asset_category)
    where_clause = " AND ".join(conditions)
    timestamp = _now()
    sql = f"UPDATE {TABLE_NAME} SET is_disposed = 0, disposed_at = NULL, disposed_by = NULL, updated_at = ?, updated_by = ? WHERE {where_clause}"
    with _get_connection(app) as conn:
        cur = conn.execute(sql, (timestamp, actor, *params))
        conn.commit()
        return cur.rowcount


def list_disposed_hardware_assets(
    app=None,
    asset_category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    """List disposed (불용처리) hardware assets."""
    app = app or current_app
    page = max(1, page)
    page_size = max(1, min(200, page_size))
    offset = (page - 1) * page_size
    base_where = ["ha.is_deleted = 0", "ha.is_disposed = 1"]
    params: List[Any] = []
    if asset_category:
        base_where.append("ha.asset_category = ?")
        params.append(asset_category)
    if search:
        token = f"%{search.strip()}%"
        base_where.append(
            "("
            "ha.asset_code LIKE ? OR ha.asset_name LIKE ? OR ha.work_name LIKE ? "
            "OR ha.system_name LIKE ? OR ha.system_ip LIKE ? OR ha.mgmt_ip LIKE ? "
            "OR ha.manufacturer_code LIKE ? OR ha.server_code LIKE ?"
            ")"
        )
        params.extend([token] * 8)
    where_clause = " AND ".join(base_where)
    count_sql = f"SELECT COUNT(1) FROM {TABLE_NAME} ha WHERE {where_clause}"
    with _get_connection(app) as conn:
        owner_select_clause, owner_join_clause = _owner_join_fragments(conn)
        select_sql = f"""
        SELECT
            ha.*,
            bwc.category_name AS work_category_name,
            bwd.division_name AS work_division_name,
            bws.status_name AS work_status_name,
            bws.status_level AS work_status_color,
            bwo.operation_name AS work_operation_name,
            bwg.group_name AS work_group_name,
            bvm.manufacturer_name,
            hst.model_name,
            oc.center_name,
            COALESCE(orack.rack_position, orack.rack_code) AS rack_name,
            sys_dept.dept_name AS system_dept_name,
            svc_dept.dept_name AS service_dept_name,{owner_select_clause}
        FROM {TABLE_NAME} ha
        LEFT JOIN biz_work_category bwc ON bwc.category_code = ha.work_category_code
        LEFT JOIN biz_work_division bwd ON bwd.division_code = ha.work_division_code
        LEFT JOIN biz_work_status bws ON bws.status_code = ha.work_status_code
        LEFT JOIN biz_work_operation bwo ON bwo.operation_code = ha.work_operation_code
        LEFT JOIN biz_work_group bwg ON bwg.group_code = ha.work_group_code
        LEFT JOIN biz_vendor_manufacturer bvm ON bvm.manufacturer_code = ha.manufacturer_code
        LEFT JOIN hw_server_type hst ON hst.server_code = ha.server_code
        LEFT JOIN org_center oc ON oc.center_code = ha.center_code
        LEFT JOIN org_rack orack ON orack.rack_code = ha.rack_code
        LEFT JOIN org_department sys_dept ON sys_dept.dept_code = ha.system_dept_code
        LEFT JOIN org_department svc_dept ON svc_dept.dept_code = ha.service_dept_code{owner_join_clause}
        WHERE {where_clause}
        ORDER BY ha.disposed_at DESC, ha.id DESC
        LIMIT ? OFFSET ?
        """
        rows = conn.execute(select_sql, (*params, page_size, offset)).fetchall()
        total = conn.execute(count_sql, params).fetchone()[0]
    return {
        "items": [_row_to_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
