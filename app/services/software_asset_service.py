"""Service helpers for the software_asset table (SQLite-based CRUD)."""

from __future__ import annotations

import logging
import os
import re
import secrets
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

# NOTE: dev_blossom.db already contains a separate table named "software" with a
# different schema. The APIs behind tab02-software are backed by the
# "software_asset" table.
TABLE_NAME = "software_asset"
DB_FILENAME = "software_asset.db"

SOFTWARE_ASSET_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_category          TEXT NOT NULL,
    asset_type              TEXT NOT NULL,
    asset_code              TEXT NOT NULL UNIQUE,
    asset_name              TEXT NOT NULL,
    work_category_code      TEXT,
    work_division_code      TEXT,
    work_status_code        TEXT,
    work_operation_code     TEXT,
    work_group_code         TEXT,
    work_name               TEXT,
    sw_code                 TEXT NOT NULL UNIQUE,
    software_type           TEXT,
    software_category       TEXT,
    manufacturer_code       TEXT,
    os_code                 TEXT,
    system_dept_code        TEXT,
    system_owner_emp_no     TEXT,
    service_dept_code       TEXT,
    service_owner_emp_no    TEXT,
    license_method          TEXT,
    license_unit            TEXT,
    license_total_count     INTEGER NOT NULL DEFAULT 0,
    license_assign_count    INTEGER NOT NULL DEFAULT 0,
    license_available_count INTEGER NOT NULL DEFAULT 0,
    license_note            TEXT,
    remark                  TEXT,
    created_at              TEXT NOT NULL,
    created_by              TEXT NOT NULL,
    updated_at              TEXT,
    updated_by              TEXT,
    is_deleted              INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (work_category_code)   REFERENCES biz_work_category (category_code),
    FOREIGN KEY (work_division_code)   REFERENCES biz_work_division (division_code),
    FOREIGN KEY (work_status_code)     REFERENCES biz_work_status (status_code),
    FOREIGN KEY (work_operation_code)  REFERENCES biz_work_operation (operation_code),
    FOREIGN KEY (work_group_code)      REFERENCES biz_work_group (group_code),
    FOREIGN KEY (manufacturer_code)    REFERENCES biz_vendor_manufacturer (manufacturer_code),
    FOREIGN KEY (os_code)              REFERENCES sw_os_type (os_code),
    FOREIGN KEY (system_dept_code)     REFERENCES org_department (dept_code),
    FOREIGN KEY (service_dept_code)    REFERENCES org_department (dept_code),
    FOREIGN KEY (system_owner_emp_no)  REFERENCES org_user (emp_no),
    FOREIGN KEY (service_owner_emp_no) REFERENCES org_user (emp_no)
);
CREATE INDEX IF NOT EXISTS idx_software_asset_category ON {TABLE_NAME}(asset_category);
CREATE INDEX IF NOT EXISTS idx_software_asset_type ON {TABLE_NAME}(asset_type);
CREATE INDEX IF NOT EXISTS idx_software_asset_code ON {TABLE_NAME}(asset_code);
CREATE INDEX IF NOT EXISTS idx_software_asset_sw_code ON {TABLE_NAME}(sw_code);
CREATE INDEX IF NOT EXISTS idx_software_asset_deleted ON {TABLE_NAME}(is_deleted);
"""

SOFTWARE_ASSET_COLUMNS = (
    "id",
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
    "sw_code",
    "software_type",
    "software_category",
    "manufacturer_code",
    "os_code",
    "system_dept_code",
    "system_owner_emp_no",
    "service_dept_code",
    "service_owner_emp_no",
    "license_method",
    "license_unit",
    "license_total_count",
    "license_assign_count",
    "license_available_count",
    "license_note",
    "remark",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "is_deleted",
)

INITIALIZED_DBS: set[str] = set()

STRING_COLUMNS = (
    "work_category_code",
    "work_division_code",
    "work_status_code",
    "work_operation_code",
    "work_group_code",
    "work_name",
    "software_type",
    "software_category",
    "manufacturer_code",
    "os_code",
    "system_dept_code",
    "system_owner_emp_no",
    "service_dept_code",
    "service_owner_emp_no",
    "license_method",
    "license_unit",
    "license_note",
    "remark",
)

INT_COLUMNS = (
    "license_total_count",
    "license_assign_count",
    "license_available_count",
)

LIST_SELECT_COLUMNS = (
    "id",
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
    "sw_code",
    "software_type",
    "software_category",
    "manufacturer_code",
    "os_code",
    "system_dept_code",
    "system_owner_emp_no",
    "service_dept_code",
    "service_owner_emp_no",
    "license_method",
    "license_unit",
    "license_total_count",
    "license_assign_count",
    "license_available_count",
    "license_note",
    "remark",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "is_deleted",
)


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get("SOFTWARE_ASSET_SQLITE_PATH")
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

        # sqlite:///file.db -> path='/file.db' (single leading / = relative)
        # sqlite:////abs.db  -> path='//abs.db' (double leading / = absolute)
        if path.startswith('/') and not path.startswith('//'):
            path = path.lstrip('/')

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
    parent = os.path.dirname(path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)


def _ensure_schema(conn: sqlite3.Connection, db_path: str) -> None:
    def has_table(name: str) -> bool:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (name,),
        ).fetchone()
        return row is not None

    def fk_targets(table: str) -> list[str]:
        try:
            rows = conn.execute(f"PRAGMA foreign_key_list({table})").fetchall()
        except sqlite3.DatabaseError:
            return []
        return [str(r[2] or "") for r in rows]  # r[2] = referenced table

    def table_columns(table: str) -> set[str]:
        try:
            rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        except sqlite3.DatabaseError:
            return set()
        return {str(r[1]) for r in rows}  # r[1] = column name

    def ensure_default_work_status_codes() -> None:
        # No-op: FK seed was removed. Status codes must be populated by the user.
        pass

    def needs_fk_heal() -> bool:
        targets = [t.strip().lower() for t in fk_targets(TABLE_NAME)]
        # Old/broken schema used a FK to the "user" VIEW; SQLite forbids FK refs to views.
        return any(t == "user" for t in targets)

    # Create fresh schema if missing.
    if not has_table(TABLE_NAME):
        conn.executescript(SOFTWARE_ASSET_TABLE_SQL)
        ensure_default_work_status_codes()
        conn.commit()
        INITIALIZED_DBS.add(db_path)
        return

    # If the table exists but FK targets are invalid, rebuild in-place.
    if needs_fk_heal():
        logger.warning("software_asset: detected invalid FK schema; rebuilding table")
        old_name = f"{TABLE_NAME}__old"
        try:
            # Clean up any previous failed migration attempts.
            if has_table(old_name):
                conn.execute(f"DROP TABLE {old_name}")

            conn.execute(f"ALTER TABLE {TABLE_NAME} RENAME TO {old_name}")
            conn.executescript(SOFTWARE_ASSET_TABLE_SQL)

            old_cols = table_columns(old_name)
            insert_cols = [c for c in SOFTWARE_ASSET_COLUMNS if c in table_columns(TABLE_NAME)]
            select_exprs: list[str] = []
            for c in insert_cols:
                if c in old_cols:
                    select_exprs.append(c)
                else:
                    select_exprs.append(f"NULL AS {c}")
            if insert_cols:
                conn.execute(
                    f"INSERT INTO {TABLE_NAME} ({', '.join(insert_cols)}) SELECT {', '.join(select_exprs)} FROM {old_name}"
                )
            conn.execute(f"DROP TABLE {old_name}")
            ensure_default_work_status_codes()
            conn.commit()
        except Exception:
            conn.rollback()
            # If anything fails, attempt to restore original table name.
            try:
                if has_table(old_name) and not has_table(TABLE_NAME):
                    conn.execute(f"ALTER TABLE {old_name} RENAME TO {TABLE_NAME}")
                    conn.commit()
            except Exception:
                pass
            raise

    INITIALIZED_DBS.add(db_path)
    try:
        ensure_default_work_status_codes()
        conn.commit()
    except sqlite3.DatabaseError:
        # Seeding is best-effort; keep schema init resilient.
        conn.rollback()


def _get_connection(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = _resolve_db_path(app)
    _ensure_parent(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
    except sqlite3.DatabaseError:
        logger.warning("software_asset: failed to enable FK enforcement")
    _ensure_schema(conn, db_path)
    return conn


def init_software_asset_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app):
        logger.info("software_asset table ready")


def _clean_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_int(value: Any) -> int:
    if value in (None, ""):
        return 0
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else 0
    except (TypeError, ValueError):
        return 0


def _normalize_category(value: str) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError("asset_category는 필수입니다.")
    return text.replace("-", "_").upper()


def _normalize_type(value: str) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError("asset_type은 필수입니다.")
    return text.replace("-", "_").upper()


def _random_fragment(length: int = 6) -> str:
    bytes_len = max(1, (length + 1) // 2)
    return secrets.token_hex(bytes_len).upper()[:length]


def _value_exists(conn: sqlite3.Connection, column: str, value: str) -> bool:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE {column} = ?",
        (value,),
    ).fetchone()
    return row is not None


def _assert_unique(conn: sqlite3.Connection, column: str, value: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE {column} = ?",
        (value,),
    ).fetchone()
    if row and (record_id is None or row["id"] != record_id):
        if column == "asset_code":
            raise ValueError("이미 사용 중인 자산 코드입니다.")
        raise ValueError("이미 사용 중인 소프트웨어 코드입니다.")


def _generate_code(conn: sqlite3.Connection, column: str, category: str, asset_type: str, prefix: str) -> str:
    seed = f"{category}_{asset_type}".upper()
    seed = re.sub(r"[^A-Z0-9]+", "_", seed).strip("_") or prefix
    base = f"{prefix}_{seed}"[:40]
    candidate = f"{base}_{_random_fragment(4)}"
    counter = 0
    while _value_exists(conn, column, candidate):
        candidate = f"{base}_{_random_fragment(4)}"
        counter += 1
        if counter > 100:
            raise ValueError("고유 코드를 생성하지 못했습니다.")
    return candidate


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    data: Dict[str, Any] = {}
    for column in LIST_SELECT_COLUMNS:
        value = row[column]
        if column in INT_COLUMNS:
            data[column] = int(value or 0)
        else:
            data[column] = value
    return data


def list_software_assets(
    *,
    app=None,
    asset_category: Optional[str] = None,
    asset_type: Optional[str] = None,
    search: Optional[str] = None,
    filters: Optional[Dict[str, Any]] = None,
    page: int = 1,
    page_size: int = 50,
    include_deleted: bool = False,
) -> Dict[str, Any]:
    app = app or current_app
    filters = filters or {}
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    clauses: List[str] = []
    params: List[Any] = []
    if not include_deleted:
        clauses.append("is_deleted = 0")
    if asset_category:
        clauses.append("asset_category = ?")
        params.append(_normalize_category(asset_category))
    if asset_type:
        clauses.append("asset_type = ?")
        params.append(_normalize_type(asset_type))
    for column in (
        "work_category_code",
        "work_division_code",
        "work_status_code",
        "work_operation_code",
        "work_group_code",
        "system_dept_code",
        "service_dept_code",
        "manufacturer_code",
    ):
        value = _clean_str(filters.get(column))
        if value:
            clauses.append(f"{column} = ?")
            params.append(value)
    search_token = (search or "").strip()
    if search_token:
        like = f"%{search_token}%"
        clauses.append(
            "("
            " asset_name LIKE ? OR asset_code LIKE ? OR sw_code LIKE ? OR work_name LIKE ? OR"
            " license_note LIKE ? OR license_method LIKE ? OR license_unit LIKE ?"
            ")"
        )
        params.extend([like] * 7)
    where_clause = " AND ".join(clauses) if clauses else "1=1"
    with _get_connection(app) as conn:
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE {where_clause}",
            params,
        ).fetchone()[0]
        offset = (page - 1) * page_size
        rows = conn.execute(
            f"SELECT {', '.join(LIST_SELECT_COLUMNS)} FROM {TABLE_NAME} "
            f"WHERE {where_clause} ORDER BY id DESC LIMIT ? OFFSET ?",
            [*params, page_size, offset],
        ).fetchall()
    items = [_row_to_dict(row) for row in rows]
    return {
        "items": items,
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
    }


def get_software_asset(
    asset_id: int,
    *,
    app=None,
    asset_category: Optional[str] = None,
    asset_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    clauses = ["id = ?", "is_deleted = 0"]
    params: List[Any] = [asset_id]
    if asset_category:
        clauses.append("asset_category = ?")
        params.append(_normalize_category(asset_category))
    if asset_type:
        clauses.append("asset_type = ?")
        params.append(_normalize_type(asset_type))
    where_clause = " AND ".join(clauses)
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT {', '.join(LIST_SELECT_COLUMNS)} FROM {TABLE_NAME} WHERE {where_clause}",
            params,
        ).fetchone()
    return _row_to_dict(row) if row else None


def list_software_asset_name_catalog(
    *,
    app=None,
    asset_category: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Return distinct software asset names (asset_name) for searchable dropdowns.

    This is used by the server-detail software tab to suggest "모델명" values.
    """

    app = app or current_app
    try:
        limit_n = int(limit)
    except Exception:
        limit_n = 50
    limit_n = max(1, min(limit_n, 200))

    clauses: List[str] = ["is_deleted = 0"]
    params: List[Any] = []

    if asset_category:
        clauses.append("asset_category = ?")
        params.append(_normalize_category(asset_category))

    q = (query or '').strip()
    if q:
        clauses.append("asset_name LIKE ?")
        params.append(f"%{q}%")

    where_clause = " AND ".join(clauses) if clauses else "1=1"

    with _get_connection(app) as conn:
        rows = conn.execute(
            f"""
            SELECT
                asset_name,
                COALESCE(MAX(manufacturer_code), '') AS manufacturer_code,
                COUNT(*) AS usage_count
            FROM {TABLE_NAME}
            WHERE {where_clause}
            GROUP BY asset_name
            ORDER BY usage_count DESC, asset_name ASC
            LIMIT ?
            """,
            [*params, limit_n],
        ).fetchall()

    out: List[Dict[str, Any]] = []
    for r in rows:
        name = (r['asset_name'] or '').strip()
        if not name:
            continue
        code = (r['manufacturer_code'] or '').strip() or None
        out.append({'name': name, 'manufacturer_code': code})
    return out


def _prepare_write_payload(
    payload: Dict[str, Any],
    *,
    asset_category: str,
    asset_type: str,
    existing_id: Optional[int],
    conn: sqlite3.Connection,
    existing_row: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    actor_payload: Dict[str, Any] = {
        "asset_category": _normalize_category(asset_category),
        "asset_type": _normalize_type(asset_type),
    }
    asset_name = _clean_str(payload.get("asset_name"))
    if existing_id is None and not asset_name:
        raise ValueError("asset_name은 필수입니다.")
    if asset_name:
        actor_payload["asset_name"] = asset_name
    asset_code = _clean_str(payload.get("asset_code"))
    if asset_code:
        _assert_unique(conn, "asset_code", asset_code, existing_id)
        actor_payload["asset_code"] = asset_code
    elif existing_id is None:
        actor_payload["asset_code"] = _generate_code(
            conn, "asset_code", actor_payload["asset_category"], actor_payload["asset_type"], "SA"
        )
    sw_code = _clean_str(payload.get("sw_code"))
    if sw_code:
        _assert_unique(conn, "sw_code", sw_code, existing_id)
        actor_payload["sw_code"] = sw_code
    elif existing_id is None:
        actor_payload["sw_code"] = _generate_code(
            conn, "sw_code", actor_payload["asset_category"], actor_payload["asset_type"], "SW"
        )
    elif "sw_code" in payload and not sw_code:
        raise ValueError("sw_code는 비워둘 수 없습니다.")
    for column in STRING_COLUMNS:
        if column in payload:
            actor_payload[column] = _clean_str(payload[column])
    current_total = existing_row.get("license_total_count", 0) if existing_row else 0
    current_assigned = existing_row.get("license_assign_count", 0) if existing_row else 0
    # license_total_count defaults to 0 for 신규 등록
    force_total = existing_id is None or "license_total_count" in payload
    force_assigned = existing_id is None or "license_assign_count" in payload
    total = _safe_int(payload.get("license_total_count")) if force_total else None
    assigned = _safe_int(payload.get("license_assign_count")) if force_assigned else None
    available_override = payload.get("license_available_count") if "license_available_count" in payload else None
    if total is not None:
        actor_payload["license_total_count"] = total
    if assigned is not None:
        comparison_total = total if total is not None else current_total
        if assigned > comparison_total:
            assigned = comparison_total
        actor_payload["license_assign_count"] = assigned
    if available_override is not None:
        actor_payload["license_available_count"] = min(
            _safe_int(available_override),
            actor_payload.get("license_total_count", total if total is not None else current_total),
        )
    elif total is not None or assigned is not None or existing_id is None:
        base_total = actor_payload.get("license_total_count", current_total)
        base_assigned = actor_payload.get("license_assign_count", current_assigned)
        actor_payload["license_available_count"] = max(0, base_total - base_assigned)
    return actor_payload


def create_software_asset(
    payload: Dict[str, Any],
    actor: str,
    *,
    app=None,
    asset_category: Optional[str] = None,
    asset_type: Optional[str] = None,
) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or "system").strip() or "system"
    if not asset_category:
        asset_category = payload.get("asset_category")
    if not asset_type:
        asset_type = payload.get("asset_type")
    if not asset_category or not asset_type:
        raise ValueError("asset_category와 asset_type이 필요합니다.")
    timestamp = _now()
    with _get_connection(app) as conn:
        prepared = _prepare_write_payload(
            payload,
            asset_category=asset_category,
            asset_type=asset_type,
            existing_id=None,
            conn=conn,
            existing_row=None,
        )
        asset_name = prepared.get("asset_name")
        if not asset_name:
            raise ValueError("asset_name은 필수입니다.")
        columns = [
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
            "sw_code",
            "software_type",
            "software_category",
            "manufacturer_code",
            "os_code",
            "system_dept_code",
            "system_owner_emp_no",
            "service_dept_code",
            "service_owner_emp_no",
            "license_method",
            "license_unit",
            "license_total_count",
            "license_assign_count",
            "license_available_count",
            "license_note",
            "remark",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
            "is_deleted",
        ]
        values: List[Any] = []
        for column in columns:
            if column == "created_at" or column == "updated_at":
                values.append(timestamp)
            elif column == "created_by" or column == "updated_by":
                values.append(actor)
            elif column == "is_deleted":
                values.append(0)
            elif column in INT_COLUMNS:
                values.append(int(prepared.get(column, 0) or 0))
            else:
                values.append(prepared.get(column))
        placeholders = ",".join("?" for _ in columns)
        conn.execute(
            f"INSERT INTO {TABLE_NAME} ({', '.join(columns)}) VALUES ({placeholders})",
            values,
        )
        asset_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()
    return get_software_asset(asset_id, app=app)


def update_software_asset(
    asset_id: int,
    payload: Dict[str, Any],
    actor: str,
    *,
    app=None,
    asset_category: Optional[str] = None,
    asset_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or "system").strip() or "system"
    if not payload:
        return get_software_asset(asset_id, app=app, asset_category=asset_category, asset_type=asset_type)
    existing_row = get_software_asset(asset_id, app=app, asset_category=asset_category, asset_type=asset_type)
    if not existing_row:
        return None
    category_for_write = asset_category or payload.get("asset_category") or existing_row.get("asset_category")
    asset_type_for_write = asset_type or payload.get("asset_type") or existing_row.get("asset_type")
    with _get_connection(app) as conn:
        prepared = _prepare_write_payload(
            payload,
            asset_category=category_for_write,
            asset_type=asset_type_for_write,
            existing_id=asset_id,
            conn=conn,
            existing_row=existing_row,
        )
        if not prepared:
            return get_software_asset(asset_id, app=app, asset_category=asset_category, asset_type=asset_type)
        updates: List[str] = []
        params: List[Any] = []
        for column, value in prepared.items():
            updates.append(f"{column} = ?")
            params.append(value)
        updates.extend(["updated_at = ?", "updated_by = ?"])
        params.extend([_now(), actor, asset_id])
        clauses = ["id = ?", "is_deleted = 0"]
        if asset_category:
            clauses.append("asset_category = ?")
            params.append(_normalize_category(asset_category))
        if asset_type:
            clauses.append("asset_type = ?")
            params.append(_normalize_type(asset_type))
        where_clause = " AND ".join(clauses)
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE {where_clause}",
            params,
        )
        if cur.rowcount == 0:
            conn.rollback()
            return None
        conn.commit()
    return get_software_asset(asset_id, app=app)


def soft_delete_software_assets(
    asset_ids: Iterable[Any],
    actor: str,
    *,
    app=None,
    asset_category: Optional[str] = None,
    asset_type: Optional[str] = None,
) -> int:
    app = app or current_app
    actor = (actor or "system").strip() or "system"
    normalized_ids: List[int] = []
    for raw in asset_ids:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value >= 0:
            normalized_ids.append(value)
    if not normalized_ids:
        return 0
    placeholders = ",".join("?" for _ in normalized_ids)
    params: List[Any] = [_now(), actor, *normalized_ids]
    clauses = [f"id IN ({placeholders})", "is_deleted = 0"]
    if asset_category:
        clauses.append("asset_category = ?")
        params.append(_normalize_category(asset_category))
    if asset_type:
        clauses.append("asset_type = ?")
        params.append(_normalize_type(asset_type))
    where_clause = " AND ".join(clauses)
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE {where_clause}",
            params,
        )
        conn.commit()
        return cur.rowcount
