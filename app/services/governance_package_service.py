"""Governance: package inventory queries and dashboard aggregates.

Data source is the same main SQLite DB table used by server detail > package tab:
- asset_package

We enrich rows with business/system names by looking up hardware assets using
hardware_asset_service.get_hardware_asset().

Note: hardware assets live in a separate SQLite DB; we do enrichment in Python.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

from app.services.hardware_asset_service import get_hardware_asset

logger = logging.getLogger(__name__)


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
        existing = {str(r[1]) for r in cols}
        add_cols = {
            "vendor": "TEXT",
            "package_type": "TEXT",
            "identifier": "TEXT",
            "license": "TEXT",
            "vulnerability": "TEXT",
            "updated_at": "TEXT",
            "is_deleted": "INTEGER NOT NULL DEFAULT 0",
        }
        for name, col_type in add_cols.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE asset_package ADD COLUMN {name} {col_type}")
    except Exception:
        logger.exception("Failed to ensure asset_package schema (governance)")

    conn.commit()
    _INITIALIZED.add(db_path)


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    created_at = str(row["created_at"] or "")
    updated_at = row["updated_at"]
    updated_at_str = str(updated_at) if updated_at is not None and str(updated_at).strip() else created_at

    return {
        "id": int(row["id"]),
        "asset_scope": str(row["asset_scope"] or ""),
        "asset_id": int(row["asset_id"]),
        "package": str(row["package_name"] or ""),
        "version": str(row["version"] or ""),
        "package_type": str(row["package_type"] or ""),
        "identifier": str(row["identifier"] or ""),
        "manufacturer": str(row["vendor"] or ""),
        "license": str(row["license"] or ""),
        "vulnerability": str(row["vulnerability"] or ""),
        "created_at": created_at,
        "updated_at": updated_at_str,
    }


def _safe_token(value: Any) -> str:
    return str(value or "").strip()


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _batch(iterable: Iterable[int], size: int) -> Iterable[List[int]]:
    buf: List[int] = []
    for x in iterable:
        buf.append(x)
        if len(buf) >= size:
            yield buf
            buf = []
    if buf:
        yield buf


def list_governance_packages(*, q: str = "", limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Return package rows enriched with work_name/system_name.

    Filtering: we perform a basic DB-side filter on package columns, then do a
    second pass that also checks work/system name.
    """

    q = (q or "").strip()
    db_path = _resolve_sqlite_db_path()
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        params: List[Any] = []
        where = ["is_deleted = 0"]
        if q:
            like = f"%{q}%"
            where.append(
                "(package_name LIKE ? OR version LIKE ? OR package_type LIKE ? OR identifier LIKE ? OR vendor LIKE ? OR license LIKE ? OR vulnerability LIKE ?)"
            )
            params.extend([like, like, like, like, like, like, like])
        where_sql = " AND ".join(where)

        sql = f"""
        SELECT *
        FROM asset_package
        WHERE {where_sql}
        ORDER BY id DESC
        """
        if limit and int(limit) > 0:
            sql += " LIMIT ?"
            params.append(int(limit))

        rows = conn.execute(sql, tuple(params)).fetchall()

    items = [_row_to_dict(r) for r in rows]

    # Enrichment: resolve work_name/system_name from hardware assets DB.
    asset_ids = sorted({int(it["asset_id"]) for it in items if int(it.get("asset_id") or 0) > 0})
    asset_map: Dict[int, Dict[str, str]] = {}

    # get_hardware_asset is single-row; cache and batch to avoid excessive overhead.
    for chunk in _batch(asset_ids, 200):
        for aid in chunk:
            try:
                row = get_hardware_asset(aid)
            except Exception:
                row = None
            if not row:
                asset_map[aid] = {"work_name": "", "system_name": "", "ip_address": ""}
                continue
            asset_map[aid] = {
                "work_name": _safe_token(row.get("work_name")),
                "system_name": _safe_token(row.get("system_name")),
                "ip_address": _safe_token(row.get("ip_address")),
            }

    for it in items:
        meta = asset_map.get(int(it["asset_id"])) or {"work_name": "", "system_name": "", "ip_address": ""}
        it["work_name"] = meta.get("work_name", "")
        it["system_name"] = meta.get("system_name", "")
        it["ip_address"] = meta.get("ip_address", "")

    # Post-filter so q also hits 업무명/시스템명.
    if q:
        qq = q.lower()
        def _hit(it: Dict[str, Any]) -> bool:
            hay = " ".join([
                _safe_token(it.get("work_name")),
                _safe_token(it.get("system_name")),
                _safe_token(it.get("package")),
                _safe_token(it.get("version")),
                _safe_token(it.get("package_type")),
                _safe_token(it.get("identifier")),
                _safe_token(it.get("manufacturer")),
                _safe_token(it.get("license")),
                _safe_token(it.get("vulnerability")),
            ]).lower()
            return qq in hay

        items = [it for it in items if _hit(it)]

    return items


def compute_package_dashboard(*, top_n: int = 10) -> Dict[str, Any]:
    """Aggregate package rows for dashboard charts."""

    db_path = _resolve_sqlite_db_path()
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        rows = conn.execute(
            """
            SELECT package_name, version, package_type, vendor, license, vulnerability
            FROM asset_package
            WHERE is_deleted = 0
            """
        ).fetchall()

    def norm(v: Any) -> str:
        s = str(v or "").strip()
        return s if s else "(미상)"

    counts_version: Dict[str, int] = {}
    counts_type: Dict[str, int] = {}
    counts_vendor: Dict[str, int] = {}
    counts_license: Dict[str, int] = {}
    vuln_yes = 0
    vuln_no = 0

    for r in rows:
        ver = norm(r["version"])
        typ = norm(r["package_type"])
        ven = norm(r["vendor"])
        lic = norm(r["license"])

        counts_version[ver] = counts_version.get(ver, 0) + 1
        counts_type[typ] = counts_type.get(typ, 0) + 1
        counts_vendor[ven] = counts_vendor.get(ven, 0) + 1
        counts_license[lic] = counts_license.get(lic, 0) + 1

        vuln = str(r["vulnerability"] or "").strip()
        if vuln:
            vuln_yes += 1
        else:
            vuln_no += 1

    def top_items(m: Dict[str, int], n: int) -> List[Dict[str, Any]]:
        return [
            {"label": k, "count": v}
            for k, v in sorted(m.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
        ]

    return {
        "total": len(rows),
        "by_version": top_items(counts_version, int(top_n)),
        "by_type": top_items(counts_type, int(top_n)),
        "by_vendor": top_items(counts_vendor, int(top_n)),
        "by_license": top_items(counts_license, int(top_n)),
        "vuln_presence": [
            {"label": "취약점 있음", "count": vuln_yes},
            {"label": "취약점 없음", "count": vuln_no},
        ],
    }
