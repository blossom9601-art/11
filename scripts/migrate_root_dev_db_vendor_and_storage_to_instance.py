"""Migrate vendor manufacturers + hw storage types from the legacy root DB to the active instance DB.

Why this exists
- Flask-SQLAlchemy resolves `sqlite:///dev_blossom.db` under `instance/`.
- Some service layers previously resolved the same URI to the project root, causing data to diverge.

What it does
- Copies missing rows from:
    <repo>/dev_blossom.db  (legacy/root)
  into:
    <repo>/instance/dev_blossom.db  (active)
- Only touches:
    - biz_vendor_manufacturer
    - hw_storage_type

Safety
- Inserts are idempotent (INSERT OR IGNORE by unique keys).
- Does not delete or modify existing destination rows.

Usage
- Run with venv python from repo root:
    python scripts/migrate_root_dev_db_vendor_and_storage_to_instance.py
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Tuple


@dataclass
class Stats:
    manufacturers_seen: int = 0
    manufacturers_inserted: int = 0
    storages_seen: int = 0
    storages_inserted: int = 0
    storages_skipped_missing_vendor: int = 0


def _repo_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))


def _src_db_path() -> str:
    return os.path.join(_repo_root(), "dev_blossom.db")


def _dst_db_path() -> str:
    return os.path.join(_repo_root(), "instance", "dev_blossom.db")


def _connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
        (table,),
    ).fetchone()
    return bool(row)


def _ensure_tables(dst_conn: sqlite3.Connection) -> None:
    # Reuse the same schema as the service layers.
    from app import create_app
    from app.services import hw_storage_type_service, vendor_manufacturer_service

    app = create_app()
    with app.app_context():
        vendor_manufacturer_service.init_vendor_manufacturer_table(app)
        hw_storage_type_service.init_hw_storage_type_table(app)


def _fetch_rows(conn: sqlite3.Connection, query: str) -> List[sqlite3.Row]:
    return conn.execute(query).fetchall()


def _copy_manufacturers(src: sqlite3.Connection, dst: sqlite3.Connection, stats: Stats) -> None:
    table = "biz_vendor_manufacturer"
    if not _table_exists(src, table):
        print(f"[skip] source missing table: {table}")
        return

    rows = _fetch_rows(
        src,
        "SELECT manufacturer_code, manufacturer_name, address, business_no, call_center, "
        "hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
        "FROM biz_vendor_manufacturer",
    )
    stats.manufacturers_seen = len(rows)

    insert_sql = (
        "INSERT OR IGNORE INTO biz_vendor_manufacturer "
        "(manufacturer_code, manufacturer_name, address, business_no, call_center, "
        " hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )

    for r in rows:
        cur = dst.execute(
            insert_sql,
            (
                r["manufacturer_code"],
                r["manufacturer_name"],
                r["address"],
                r["business_no"],
                r["call_center"],
                r["hw_count"],
                r["sw_count"],
                r["component_count"],
                r["remark"],
                r["created_at"],
                r["created_by"],
                r["updated_at"],
                r["updated_by"],
                r["is_deleted"],
            ),
        )
        if cur.rowcount:
            stats.manufacturers_inserted += 1


def _copy_storage_types(src: sqlite3.Connection, dst: sqlite3.Connection, stats: Stats) -> None:
    table = "hw_storage_type"
    if not _table_exists(src, table):
        print(f"[skip] source missing table: {table}")
        return

    rows = _fetch_rows(
        src,
        "SELECT storage_code, model_name, manufacturer_code, storage_type, release_date, eosl_date, "
        "storage_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
        "FROM hw_storage_type",
    )
    stats.storages_seen = len(rows)

    # Preload destination manufacturer codes to avoid FK errors.
    dst_vendor_codes = {
        r["manufacturer_code"]
        for r in _fetch_rows(dst, "SELECT manufacturer_code FROM biz_vendor_manufacturer")
    }

    insert_sql = (
        "INSERT OR IGNORE INTO hw_storage_type "
        "(storage_code, model_name, manufacturer_code, storage_type, release_date, eosl_date, "
        " storage_count, remark, created_at, created_by, updated_at, updated_by, is_deleted) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )

    for r in rows:
        mcode = r["manufacturer_code"]
        if mcode not in dst_vendor_codes:
            # Attempt to copy missing manufacturer from source if present.
            m = src.execute(
                "SELECT manufacturer_code, manufacturer_name, address, business_no, call_center, hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
                "FROM biz_vendor_manufacturer WHERE manufacturer_code = ?",
                (mcode,),
            ).fetchone()
            if m:
                cur = dst.execute(
                    "INSERT OR IGNORE INTO biz_vendor_manufacturer "
                    "(manufacturer_code, manufacturer_name, address, business_no, call_center, hw_count, sw_count, component_count, remark, created_at, created_by, updated_at, updated_by, is_deleted) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        m["manufacturer_code"],
                        m["manufacturer_name"],
                        m["address"],
                        m["business_no"],
                        m["call_center"],
                        m["hw_count"],
                        m["sw_count"],
                        m["component_count"],
                        m["remark"],
                        m["created_at"],
                        m["created_by"],
                        m["updated_at"],
                        m["updated_by"],
                        m["is_deleted"],
                    ),
                )
                if cur.rowcount:
                    stats.manufacturers_inserted += 1
                dst_vendor_codes.add(mcode)

        if mcode not in dst_vendor_codes:
            stats.storages_skipped_missing_vendor += 1
            continue

        cur = dst.execute(
            insert_sql,
            (
                r["storage_code"],
                r["model_name"],
                r["manufacturer_code"],
                r["storage_type"],
                r["release_date"],
                r["eosl_date"],
                r["storage_count"],
                r["remark"],
                r["created_at"],
                r["created_by"],
                r["updated_at"],
                r["updated_by"],
                r["is_deleted"],
            ),
        )
        if cur.rowcount:
            stats.storages_inserted += 1


def main() -> int:
    src_path = _src_db_path()
    dst_path = _dst_db_path()

    print("[paths]")
    print("- source:", src_path)
    print("- dest  :", dst_path)

    if not os.path.exists(src_path):
        print("[error] source DB not found; nothing to migrate")
        return 2

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)

    stats = Stats()
    src = _connect(src_path)
    dst = _connect(dst_path)
    try:
        _ensure_tables(dst)
        dst.execute("BEGIN")
        _copy_manufacturers(src, dst, stats)
        _copy_storage_types(src, dst, stats)
        dst.commit()
    except Exception as exc:
        dst.rollback()
        raise
    finally:
        src.close()
        dst.close()

    print("[done]")
    print(f"- manufacturers: seen={stats.manufacturers_seen} inserted={stats.manufacturers_inserted}")
    print(f"- storages      : seen={stats.storages_seen} inserted={stats.storages_inserted} skipped_missing_vendor={stats.storages_skipped_missing_vendor}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
