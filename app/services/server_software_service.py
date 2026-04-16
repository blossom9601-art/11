from __future__ import annotations

"""Server detail-page software table persistence (sqlite3).

This backs the "tab02-software" tables on server detail pages.

We intentionally store this in the same SQLite DB file as the other
instance-local data (typically instance/dev_blossom.db) by resolving the
path from SQLALCHEMY_DATABASE_URI, with an optional override.
"""

import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = "server_software"

SERVER_SOFTWARE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    hardware_id  INTEGER NOT NULL,
    type         TEXT NOT NULL,
    subtype      TEXT,
    name         TEXT NOT NULL,
    version      TEXT,
    vendor       TEXT,
    qty          INTEGER NOT NULL DEFAULT 1,
    license_key  TEXT,
    serial       TEXT,
    maintenance  TEXT,
    remark       TEXT,
    created_at   TEXT NOT NULL,
    created_by   TEXT NOT NULL,
    updated_at   TEXT,
    updated_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_server_software_hardware_id ON {TABLE_NAME}(hardware_id);
"""

_INITIALIZED_DBS: set[str] = set()


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get("SERVER_SOFTWARE_SQLITE_PATH")
    if override:
        return os.path.abspath(override)

    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
    if uri.startswith("sqlite"):
        parsed = urlparse(uri)
        path = parsed.path or ""
        netloc = parsed.netloc or ""
        if path in (":memory:", "/:memory:"):
            return os.path.join(app.instance_path, "dev_blossom.db")
        if netloc not in ("", "localhost"):
            path = f"//{netloc}{path}"

        # Windows: urlparse('sqlite:///dev_blossom.db').path -> '/dev_blossom.db'
        if os.name == "nt" and path.startswith("/") and not path.startswith("//"):
            # '/C:/...' -> 'C:/...'
            if len(path) >= 4 and path[1].isalpha() and path[2] == ":" and path[3] == "/":
                path = path[1:]

        if os.path.isabs(path):
            return os.path.abspath(path)

        relative = path.lstrip("/")
        instance_candidate = os.path.abspath(os.path.join(app.instance_path, relative))
        project_candidate = os.path.abspath(os.path.join(_project_root(app), relative))
        if os.path.exists(instance_candidate):
            return instance_candidate
        if os.path.exists(project_candidate):
            return project_candidate
        return instance_candidate

    return os.path.join(app.instance_path, "dev_blossom.db")


def _ensure_parent(path: str) -> None:
    folder = os.path.dirname(path)
    if folder and not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True)


def _ensure_schema(conn: sqlite3.Connection, db_path: str) -> None:
    if db_path in _INITIALIZED_DBS:
        return
    conn.executescript(SERVER_SOFTWARE_TABLE_SQL)

    # Lightweight migrations for existing DBs.
    try:
        cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
        if "serial" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN serial TEXT")
        if "maintenance" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN maintenance TEXT")
        if "subtype" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN subtype TEXT")
    except Exception:
        logger.exception("Failed to apply schema migration for %s", TABLE_NAME)

    _INITIALIZED_DBS.add(db_path)


def init_server_software_table(app=None) -> str:
    """Create server_software table in the resolved SQLite DB."""
    app = app or current_app
    db_path = os.path.abspath(_resolve_db_path(app))
    _ensure_parent(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        _ensure_schema(conn, db_path)
        conn.commit()
    return db_path


def _connect(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = os.path.abspath(_resolve_db_path(app))
    _ensure_parent(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn, db_path)
    return conn


def list_server_software(hardware_id: int) -> List[Dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, hardware_id, type, subtype, name, version, vendor, qty, license_key, serial, maintenance, remark,
                   created_at, created_by, updated_at, updated_by
              FROM {TABLE_NAME}
             WHERE hardware_id = ?
             ORDER BY id ASC
            """,
            (hardware_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_server_software(hardware_id: int, sw_id: int) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE hardware_id = ? AND id = ?",
            (hardware_id, sw_id),
        ).fetchone()
        return dict(row) if row else None


def create_server_software(hardware_id: int, payload: Dict[str, Any], actor: str) -> Dict[str, Any]:
    sw_type = (payload.get("type") or "").strip()
    name = (payload.get("name") or "").strip()
    if not sw_type:
        raise ValueError("유형은 필수입니다.")
    if not name:
        raise ValueError("이름은 필수입니다.")

    subtype = (payload.get("subtype") or "").strip() or None
    version = (payload.get("version") or "").strip() or None
    vendor = (payload.get("vendor") or "").strip() or None
    license_key = (payload.get("license_key") or payload.get("license") or "").strip() or None
    serial = (payload.get("serial") or "").strip() or None
    maintenance = (payload.get("maintenance") or "").strip() or None
    remark = (payload.get("remark") or "").strip() or None
    if maintenance is None:
        maintenance = remark

    qty_raw = payload.get("qty")
    try:
        qty = int(qty_raw) if qty_raw is not None and str(qty_raw).strip() != "" else 1
    except Exception:
        qty = 1
    if qty < 1:
        raise ValueError("수량은 1 이상이어야 합니다.")

    now = _now()

    with _connect() as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                hardware_id, type, subtype, name, version, vendor, qty, license_key, serial, maintenance, remark,
                created_at, created_by, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hardware_id,
                sw_type,
                subtype,
                name,
                version,
                vendor,
                qty,
                license_key,
                serial,
                maintenance,
                remark,
                now,
                actor,
                now,
                actor,
            ),
        )
        conn.commit()
        sw_id = int(cur.lastrowid)
    item = get_server_software(hardware_id, sw_id)
    if not item:
        raise RuntimeError("생성된 항목을 다시 조회할 수 없습니다.")
    return item


def update_server_software(hardware_id: int, sw_id: int, payload: Dict[str, Any], actor: str) -> Optional[Dict[str, Any]]:
    existing = get_server_software(hardware_id, sw_id)
    if not existing:
        return None

    sw_type = (payload.get("type") if "type" in payload else existing.get("type") or "").strip()
    name = (payload.get("name") if "name" in payload else existing.get("name") or "").strip()
    if not sw_type:
        raise ValueError("유형은 필수입니다.")
    if not name:
        raise ValueError("이름은 필수입니다.")

    subtype = existing.get("subtype")
    if "subtype" in payload:
        subtype = (payload.get("subtype") or "").strip() or None

    def _field(key: str) -> Optional[str]:
        if key not in payload:
            return existing.get(key)
        val = (payload.get(key) or "").strip()
        return val or None

    version = _field("version")
    vendor = _field("vendor")
    serial = _field("serial")
    maintenance = _field("maintenance")
    remark = _field("remark")
    if maintenance is None and "maintenance" not in payload and "remark" in payload:
        maintenance = (payload.get("remark") or "").strip() or None

    license_key = existing.get("license_key")
    if "license_key" in payload or "license" in payload:
        raw = payload.get("license_key") if "license_key" in payload else payload.get("license")
        license_key = (raw or "").strip() or None

    qty = existing.get("qty") or 1
    if "qty" in payload:
        qty_raw = payload.get("qty")
        try:
            qty = int(qty_raw) if qty_raw is not None and str(qty_raw).strip() != "" else 1
        except Exception:
            qty = 1
    if int(qty) < 1:
        raise ValueError("수량은 1 이상이어야 합니다.")

    now = _now()

    with _connect() as conn:
        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
               SET type = ?,
                   subtype = ?,
                   name = ?,
                   version = ?,
                   vendor = ?,
                   qty = ?,
                   license_key = ?,
                   serial = ?,
                   maintenance = ?,
                   remark = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE hardware_id = ? AND id = ?
            """,
            (
                sw_type,
                subtype,
                name,
                version,
                vendor,
                int(qty),
                license_key,
                serial,
                maintenance,
                remark,
                now,
                actor,
                hardware_id,
                sw_id,
            ),
        )
        conn.commit()

    return get_server_software(hardware_id, sw_id)


def delete_server_software(hardware_id: int, sw_id: int) -> int:
    with _connect() as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE hardware_id = ? AND id = ?",
            (hardware_id, sw_id),
        )
        conn.commit()
        return int(cur.rowcount or 0)


def list_server_software_model_catalog(
    sw_type: str | None = None,
    query: str | None = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Returns a lightweight model catalog from existing server_software rows.

    Used by the server-detail software tab to power searchable dropdowns.
    """

    sw_type = (sw_type or "").strip()
    query = (query or "").strip()
    try:
        limit_n = int(limit)
    except Exception:
        limit_n = 50
    if limit_n <= 0:
        limit_n = 50
    if limit_n > 200:
        limit_n = 200

    where = []
    params: list[Any] = []

    if sw_type:
        where.append("type = ?")
        params.append(sw_type)

    if query:
        where.append("(name LIKE ? OR vendor LIKE ?)")
        like = f"%{query}%"
        params.extend([like, like])

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
                name,
                COALESCE(MAX(vendor), '') AS vendor,
                COUNT(*) AS usage_count
            FROM {TABLE_NAME}
            {where_sql}
            GROUP BY name
            ORDER BY usage_count DESC, name ASC
            LIMIT ?
            """,
            tuple(params + [limit_n]),
        ).fetchall()

        out: List[Dict[str, Any]] = []
        for r in rows:
            name = (r["name"] or "").strip()
            if not name:
                continue
            vendor = (r["vendor"] or "").strip() or None
            out.append({"name": name, "vendor": vendor})
        return out
