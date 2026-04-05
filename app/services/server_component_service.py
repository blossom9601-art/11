"""Server detail-page hardware components (tab01-hardware) persistence (sqlite3).

This backs the "하드웨어" tab tables on server detail pages.

We store these rows in the same SQLite DB file as other instance-local data
(typically instance/dev_blossom.db) by resolving the path from
SQLALCHEMY_DATABASE_URI, with an optional override.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = "server_hw_component"

SERVER_COMPONENT_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    hardware_id  INTEGER NOT NULL,
    type         TEXT NOT NULL,
    space        TEXT,
    model        TEXT NOT NULL,
    spec         TEXT,
    serial       TEXT,
    vendor       TEXT,
    qty          INTEGER NOT NULL,
    fw           TEXT,
    maintenance  TEXT,
    remark       TEXT,
    created_at   TEXT NOT NULL,
    created_by   TEXT NOT NULL,
    updated_at   TEXT,
    updated_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_hardware_id ON {TABLE_NAME}(hardware_id);
"""

_INITIALIZED_DBS: set[str] = set()


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get("SERVER_COMPONENT_SQLITE_PATH")
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
    conn.executescript(SERVER_COMPONENT_TABLE_SQL)

    # Lightweight migrations for existing DBs (SQLite doesn't support ALTER COLUMN well).
    try:
        cols = {
            r["name"]
            for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()
        }
        if "space" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN space TEXT")
        if "serial" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN serial TEXT")
        if "maintenance" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN maintenance TEXT")
        if "active_capacity" not in cols:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN active_capacity TEXT")
    except Exception:
        logger.exception("Failed to apply schema migration for %s", TABLE_NAME)

    _INITIALIZED_DBS.add(db_path)


def _connect(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = os.path.abspath(_resolve_db_path(app))
    _ensure_parent(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn, db_path)
    return conn


def _enrich_specs(items: List[Dict[str, Any]]) -> None:
    """Fill missing spec values from component-type catalog DBs (cmp_*_type)."""
    # Gather items that need spec enrichment, grouped by normalised type.
    TYPE_DB_MAP = {
        "CPU": "cmp_cpu_type",
        "GPU": "cmp_gpu_type",
        "MEMORY": "cmp_memory_type",
        "DISK": "cmp_disk_type",
        "NIC": "cmp_nic_type",
        "HBA": "cmp_hba_type",
        "ETC": "cmp_etc_type",
    }
    needs: Dict[str, List[Dict[str, Any]]] = {}
    for it in items:
        spec = (it.get("spec") or "").strip()
        if spec and spec != "-":
            continue
        comp_type = (it.get("type") or "").strip().upper()
        if not comp_type or comp_type not in TYPE_DB_MAP:
            continue
        needs.setdefault(comp_type, []).append(it)

    if not needs:
        return

    # Catalog tables live in the *project-root* dev_blossom.db (same path the
    # cmp_*_type services resolve via SQLALCHEMY_DATABASE_URI).
    try:
        app = current_app._get_current_object()
        uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
        parsed = urlparse(uri)
        rel = (parsed.path or "").lstrip("/")
        catalog_db = os.path.abspath(os.path.join(_project_root(app), rel))
    except RuntimeError:
        return

    if not os.path.exists(catalog_db):
        return

    for comp_type, needing in needs.items():
        table_name = TYPE_DB_MAP[comp_type]
        try:
            cat_conn = sqlite3.connect(catalog_db)
            cat_conn.row_factory = sqlite3.Row
            cat_rows = cat_conn.execute(
                f"SELECT model_name, spec_summary FROM {table_name} WHERE is_deleted = 0"
            ).fetchall()
            cat_conn.close()

            # Build case-insensitive model→spec lookup
            model_spec: Dict[str, str] = {}
            for cr in cat_rows:
                mn = (cr["model_name"] or "").strip()
                sp = (cr["spec_summary"] or "").strip()
                if mn and sp:
                    model_spec[mn.lower()] = sp

            for it in needing:
                model = (it.get("model") or "").strip().lower()
                if model and model in model_spec:
                    it["spec"] = model_spec[model]
        except Exception:
            logger.debug("Failed to enrich spec from %s", table_name, exc_info=True)


def list_server_components(hardware_id: int) -> List[Dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, hardware_id, type, space, model, spec, active_capacity, serial, vendor, qty, fw, maintenance, remark,
                   created_at, created_by, updated_at, updated_by
              FROM {TABLE_NAME}
             WHERE hardware_id = ?
             ORDER BY id ASC
            """,
            (hardware_id,),
        ).fetchall()
        items = [dict(r) for r in rows]
        _enrich_specs(items)
        return items


def suggest_server_component_rows(q: str = '', *, limit: int = 200) -> List[Dict[str, Any]]:
    """Suggest distinct component rows across all hardware.

    This is intended for FK-like dropdown usage in other screens (e.g., cost contract tab61).
    """

    q = (q or '').strip()
    limit = int(limit or 200)
    if limit <= 0:
        limit = 200
    if limit > 2000:
        limit = 2000

    where_clauses = [
        "type IS NOT NULL",
        "TRIM(type) != ''",
        "type != '시스템'",
    ]
    params: List[Any] = []

    if q:
        like = f"%{q}%"
        where_clauses.append(
            "(type LIKE ? OR vendor LIKE ? OR model LIKE ? OR serial LIKE ?)"
        )
        params.extend([like, like, like, like])

    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
                type,
                COALESCE(vendor, '') AS vendor,
                model,
                COALESCE(serial, '') AS serial,
                qty
            FROM {TABLE_NAME}
            WHERE {' AND '.join(where_clauses)}
            GROUP BY type, vendor, model, serial, qty
            ORDER BY type ASC, vendor ASC, model ASC, serial ASC, qty ASC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            try:
                d['qty'] = int(d.get('qty') or 0)
            except Exception:
                d['qty'] = 0
            out.append(d)
        return out


def get_server_component(hardware_id: int, component_id: int) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE hardware_id = ? AND id = ?",
            (hardware_id, component_id),
        ).fetchone()
        return dict(row) if row else None


def _req_text(payload: Dict[str, Any], key: str, label: str) -> str:
    val = (payload.get(key) or "").strip()
    if not val:
        raise ValueError(f"{label}은(는) 필수입니다.")
    return val


def _opt_text(payload: Dict[str, Any], key: str) -> Optional[str]:
    if key not in payload:
        return None
    val = (payload.get(key) or "").strip()
    return val or None


def _parse_qty(raw: Any, *, required: bool) -> int:
    if raw is None or str(raw).strip() == "":
        if required:
            raise ValueError("수량은 필수입니다.")
        return 1
    try:
        qty = int(raw)
    except Exception as exc:
        raise ValueError("수량은 숫자여야 합니다.") from exc
    if qty < 1:
        raise ValueError("수량은 1 이상이어야 합니다.")
    return qty


def create_server_component(hardware_id: int, payload: Dict[str, Any], actor: str) -> Dict[str, Any]:
    type_ = _req_text(payload, "type", "유형")
    if type_ == "시스템":
        raise ValueError("시스템 행은 등록 대상이 아닙니다.")
    model = _req_text(payload, "model", "모델명")
    qty = _parse_qty(payload.get("qty"), required=("qty" in payload))

    space = (payload.get("space") or "").strip() or None
    serial = (payload.get("serial") or "").strip() or None

    spec = (payload.get("spec") or "").strip() or None
    active_capacity = (payload.get("active_capacity") or "").strip() or None
    vendor = (payload.get("vendor") or "").strip() or None
    fw = (payload.get("fw") or "").strip() or None
    maintenance = (payload.get("maintenance") or "").strip() or None
    if maintenance is None:
        maintenance = (payload.get("remark") or "").strip() or None
    remark = (payload.get("remark") or "").strip() or None

    now = _now()
    with _connect() as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                hardware_id, type, space, model, spec, active_capacity, serial, vendor, qty, fw, maintenance, remark,
                created_at, created_by, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hardware_id,
                type_,
                space,
                model,
                spec,
                active_capacity,
                serial,
                vendor,
                qty,
                fw,
                maintenance,
                remark,
                now,
                actor,
                now,
                actor,
            ),
        )
        conn.commit()
        new_id = int(cur.lastrowid)

    item = get_server_component(hardware_id, new_id)
    if not item:
        raise RuntimeError("생성된 항목을 다시 조회할 수 없습니다.")
    return item


def update_server_component(
    hardware_id: int,
    component_id: int,
    payload: Dict[str, Any],
    actor: str,
) -> Optional[Dict[str, Any]]:
    existing = get_server_component(hardware_id, component_id)
    if not existing:
        return None

    type_ = (payload.get("type") if "type" in payload else existing.get("type") or "").strip()
    if not type_:
        raise ValueError("유형은(는) 필수입니다.")
    if type_ == "시스템":
        raise ValueError("시스템 행은 수정 대상이 아닙니다.")

    model = (payload.get("model") if "model" in payload else existing.get("model") or "").strip()
    if not model:
        raise ValueError("모델명은(는) 필수입니다.")

    qty = existing.get("qty")
    if "qty" in payload:
        qty = _parse_qty(payload.get("qty"), required=False)
    else:
        qty = int(qty) if qty is not None else 1

    def _text(key: str) -> Optional[str]:
        if key not in payload:
            return existing.get(key)
        val = (payload.get(key) or "").strip()
        return val or None

    spec = _text("spec")
    active_capacity = _text("active_capacity")
    space = _text("space")
    serial = _text("serial")
    vendor = _text("vendor")
    fw = _text("fw")
    maintenance = _text("maintenance")
    if maintenance is None and "maintenance" in payload and "remark" in payload:
        maintenance = (payload.get("maintenance") or "").strip() or None
    if maintenance is None and "maintenance" not in payload and "remark" in payload:
        maintenance = (payload.get("remark") or "").strip() or None
    remark = _text("remark")

    now = _now()
    with _connect() as conn:
        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
               SET type = ?,
                   space = ?,
                   model = ?,
                   spec = ?,
                   active_capacity = ?,
                   serial = ?,
                   vendor = ?,
                   qty = ?,
                   fw = ?,
                   maintenance = ?,
                   remark = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE hardware_id = ? AND id = ?
            """,
            (
                type_,
                space,
                model,
                spec,
                active_capacity,
                serial,
                vendor,
                qty,
                fw,
                maintenance,
                remark,
                now,
                actor,
                hardware_id,
                component_id,
            ),
        )
        conn.commit()

    return get_server_component(hardware_id, component_id)


def delete_server_component(hardware_id: int, component_id: int) -> int:
    with _connect() as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE hardware_id = ? AND id = ?",
            (hardware_id, component_id),
        )
        conn.commit()
        return int(cur.rowcount or 0)
