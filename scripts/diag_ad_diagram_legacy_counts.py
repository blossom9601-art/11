"""Diagnostic: compare legacy vs current AD-related SQLite table counts.

This script is safe to run in dev; it only reads SQLite files and prints counts.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


from app.services import network_ad_diagram_service as ad_diagram_svc
from app.services import network_ad_service as ad_svc


def _table_count(db_path: str | None, table_name: str) -> int:
    if not db_path or not os.path.exists(db_path):
        return -1

    conn = sqlite3.connect(db_path)
    try:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,),
        ).fetchone()
        if not exists:
            return 0
        return int(conn.execute(f"SELECT COUNT(1) FROM {table_name}").fetchone()[0])
    finally:
        conn.close()


def main() -> None:
    @dataclass(frozen=True)
    class _AppStub:
        config: dict
        instance_path: str
        root_path: str

    # Match config.py defaults (DevelopmentConfig) without constructing the Flask app.
    sqlite_name = os.environ.get("BLOSSOM_SQLITE_FILE") or "dev_blossom.db"
    sqlalchemy_uri = os.environ.get("DATABASE_URL") or f"sqlite:///{sqlite_name}"

    cfg: dict = {
        "SQLALCHEMY_DATABASE_URI": sqlalchemy_uri,
    }
    # Optional override used by the AD services.
    env_override = os.environ.get("NETWORK_AD_SQLITE_PATH")
    if env_override:
        cfg["NETWORK_AD_SQLITE_PATH"] = env_override

    app = _AppStub(
        config=cfg,
        instance_path=str(REPO_ROOT / "instance"),
        root_path=str(REPO_ROOT / "app"),
    )

    current_path = ad_svc._resolve_db_path(app)
    legacy_path = ad_svc._legacy_project_db_path(app)

    print("current_db:", current_path)
    print("legacy_db :", legacy_path)

    same_db = not (
        legacy_path
        and os.path.exists(legacy_path)
        and os.path.abspath(legacy_path) != os.path.abspath(current_path)
    )

    tables = [
        # AD policy + related tables
        (ad_svc.TABLE_NAME, "AD policy"),
        (ad_svc.ACCOUNT_TABLE_NAME, "AD account"),
        (ad_svc.LOG_TABLE_NAME, "AD log"),
        # Legacy table name used by older code
        (ad_svc.LEGACY_TABLE_NAME, "AD legacy (old)"),
        # AD diagram table
        (ad_diagram_svc.TABLE_NAME, "AD diagram"),
    ]

    for table, label in tables:
        cur_count = _table_count(current_path, table)
        leg_count = _table_count(legacy_path, table)
        print("-")
        print(f"table={table} ({label})")
        print("  count(current)=", cur_count)
        print("  count(legacy) =", leg_count)

        if same_db:
            print("  status=NOTE legacy db not present or same as current")
            continue

        if cur_count < 0 or leg_count < 0:
            print("  status=NOTE could not compute one or both counts")
        elif leg_count <= cur_count:
            print("  status=OK current has >= legacy")
        else:
            print("  status=WARNING legacy has more rows than current")


if __name__ == "__main__":
    main()
