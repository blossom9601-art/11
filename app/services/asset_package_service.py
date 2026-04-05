"""Asset package CRUD (tab13-package) stored in the main SQLite DB (dev_blossom.db).

This matches the sqlite3-service approach used by tab05-account so we can
create tables lazily (CREATE TABLE IF NOT EXISTS) without requiring Alembic
migrations.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)


@dataclass
class AssetPackage:
    id: int
    asset_scope: str
    asset_id: int
    package: str
    version: str
    package_type: str
    identifier: str
    manufacturer: str
    license: str
    vulnerability: str
    created_at: str
    updated_at: Optional[str]


ASSET_PACKAGE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS asset_package (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_scope   TEXT NOT NULL,
    asset_id      INTEGER NOT NULL,

    package_name  TEXT NOT NULL,
    version       TEXT,
    release       TEXT,
    vendor        TEXT,
    installed     TEXT,

    package_type  TEXT,
    identifier    TEXT,
    license       TEXT,
    vulnerability TEXT,

    created_at    TEXT NOT NULL,
    updated_at    TEXT,
    is_deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_asset_package_scope_id ON asset_package(asset_scope, asset_id);
"""

_INITIALIZED: set[str] = set()


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_sqlite_db_path(app=None) -> str:
    """Resolve the SQLite filename used by SQLAlchemy (usually dev_blossom.db)."""

    app = app or current_app
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
    if not uri.startswith("sqlite"):
        return os.path.abspath(os.path.join(app.instance_path, "dev_blossom.db"))

    parsed = urlparse(uri)
    path = parsed.path or ""
    netloc = parsed.netloc or ""

    if path in (":memory:", "/:memory:"):
        return os.path.abspath(os.path.join(app.instance_path, "dev_blossom.db"))

    if netloc not in ("", "localhost"):
        path = f"//{netloc}{path}"

    if os.name == "nt" and path.startswith("/") and not path.startswith("//"):
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


def _ensure_parent(path: str) -> None:
    folder = os.path.dirname(path)
    if folder and not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True)


def _connect(db_path: str) -> sqlite3.Connection:
    _ensure_parent(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema(conn: sqlite3.Connection, db_path: str) -> None:
    if db_path in _INITIALIZED:
        return
    conn.executescript(ASSET_PACKAGE_TABLE_SQL)

    # Backward-compatible schema upgrade for existing DBs.
    try:
        cols = conn.execute("PRAGMA table_info(asset_package)").fetchall()
        existing = {str(r[1]) for r in cols}  # (cid, name, type, notnull, dflt_value, pk)
        add_cols: Dict[str, str] = {
            "vendor": "TEXT",
            "package_type": "TEXT",
            "identifier": "TEXT",
            "license": "TEXT",
            "vulnerability": "TEXT",
        }
        for name, col_type in add_cols.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE asset_package ADD COLUMN {name} {col_type}")
    except Exception:
        logger.exception("Failed to ensure asset_package schema")

    conn.commit()
    _INITIALIZED.add(db_path)


def _row_to_package(row: sqlite3.Row) -> AssetPackage:
    return AssetPackage(
        id=int(row["id"]),
        asset_scope=str(row["asset_scope"]),
        asset_id=int(row["asset_id"]),
        package=str(row["package_name"] or ""),
        version=str(row["version"] or ""),
        package_type=str(row["package_type"] or ""),
        identifier=str(row["identifier"] or ""),
        manufacturer=str(row["vendor"] or ""),
        license=str(row["license"] or ""),
        vulnerability=str(row["vulnerability"] or ""),
        created_at=str(row["created_at"]),
        updated_at=(str(row["updated_at"]) if row["updated_at"] is not None else None),
    )


def list_packages(*, asset_scope: str, asset_id: int) -> List[Dict[str, Any]]:
    db_path = _resolve_sqlite_db_path()
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        rows = conn.execute(
            """
            SELECT *
            FROM asset_package
            WHERE asset_scope = ? AND asset_id = ? AND is_deleted = 0
            ORDER BY id ASC
            """,
            (str(asset_scope), int(asset_id)),
        ).fetchall()
    return [asdict(_row_to_package(r)) for r in rows]


def create_package(
    *,
    asset_scope: str,
    asset_id: int,
    package: str,
    version: str,
    package_type: str,
    identifier: str,
    manufacturer: str,
    license: str,
    vulnerability: str,
) -> Dict[str, Any]:
    db_path = _resolve_sqlite_db_path()
    now = _now()
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        cur = conn.execute(
            """
            INSERT INTO asset_package(
                asset_scope, asset_id,
                package_name, version,
                package_type, identifier, vendor, license, vulnerability,
                created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?)
            """,
            (
                str(asset_scope),
                int(asset_id),
                str(package),
                (version or ""),
                (package_type or ""),
                (identifier or ""),
                (manufacturer or ""),
                (license or ""),
                (vulnerability or ""),
                now,
            ),
        )
        new_id = int(cur.lastrowid)
        conn.commit()
        row = conn.execute(
            "SELECT * FROM asset_package WHERE id = ? AND is_deleted = 0", (new_id,)
        ).fetchone()

    if not row:
        raise RuntimeError("Failed to create asset package")

    return asdict(_row_to_package(row))


def update_package(
    *,
    asset_scope: str,
    asset_id: int,
    package_id: int,
    package: str,
    version: str,
    package_type: str,
    identifier: str,
    manufacturer: str,
    license: str,
    vulnerability: str,
) -> Optional[Dict[str, Any]]:
    db_path = _resolve_sqlite_db_path()
    now = _now()
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        conn.execute(
            """
            UPDATE asset_package
            SET package_name = ?,
                version = ?,
                package_type = ?,
                identifier = ?,
                vendor = ?,
                license = ?,
                vulnerability = ?,
                updated_at = ?
            WHERE id = ? AND asset_scope = ? AND asset_id = ? AND is_deleted = 0
            """,
            (
                str(package),
                (version or ""),
                (package_type or ""),
                (identifier or ""),
                (manufacturer or ""),
                (license or ""),
                (vulnerability or ""),
                now,
                int(package_id),
                str(asset_scope),
                int(asset_id),
            ),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT *
            FROM asset_package
            WHERE id = ? AND asset_scope = ? AND asset_id = ? AND is_deleted = 0
            """,
            (int(package_id), str(asset_scope), int(asset_id)),
        ).fetchone()

    if not row:
        return None

    return asdict(_row_to_package(row))


def delete_package(*, asset_scope: str, asset_id: int, package_id: int) -> bool:
    db_path = _resolve_sqlite_db_path()
    now = _now()
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        cur = conn.execute(
            """
            UPDATE asset_package
            SET is_deleted = 1, updated_at = ?
            WHERE id = ? AND asset_scope = ? AND asset_id = ? AND is_deleted = 0
            """,
            (now, int(package_id), str(asset_scope), int(asset_id)),
        )
        conn.commit()
        return int(cur.rowcount or 0) > 0
