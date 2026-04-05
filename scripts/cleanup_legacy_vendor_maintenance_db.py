from __future__ import annotations

import argparse
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

TABLES = [
    "biz_vendor_maintenance",
    "biz_vendor_maintenance_manager",
    "biz_vendor_maintenance_software",
]


def _table_exists(con: sqlite3.Connection, table: str) -> bool:
    row = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return bool(row)


def _count(con: sqlite3.Connection, table: str) -> int:
    if not _table_exists(con, table):
        return 0
    row = con.execute(f"SELECT COUNT(1) AS cnt FROM {table}").fetchone()
    return int(row[0] if row else 0)


def _open(db_path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    return con


def main() -> int:
    ap = argparse.ArgumentParser(
        description=(
            "Cleanup legacy vendor maintenance tables from root dev_blossom.db. "
            "By default, runs in dry-run mode."
        )
    )
    ap.add_argument("--apply", action="store_true", help="Actually drop tables")
    ap.add_argument(
        "--backup",
        action="store_true",
        help="Create a timestamped backup copy of legacy dev_blossom.db before dropping tables",
    )
    ap.add_argument(
        "--legacy-db",
        default="dev_blossom.db",
        help="Path to legacy DB (default: dev_blossom.db in project root)",
    )
    ap.add_argument(
        "--instance-db",
        default=str(Path("instance") / "dev_blossom.db"),
        help="Path to instance DB (default: instance/dev_blossom.db)",
    )
    args = ap.parse_args()

    legacy_db = Path(args.legacy_db)
    instance_db = Path(args.instance_db)

    if not legacy_db.exists():
        print(f"Legacy DB missing: {legacy_db}")
        return 0
    if not instance_db.exists():
        print(f"Instance DB missing: {instance_db}")
        return 2

    legacy = _open(legacy_db)
    inst = _open(instance_db)
    try:
        print("== Row counts ==")
        ok_to_drop = True
        for t in TABLES:
            legacy_cnt = _count(legacy, t)
            inst_cnt = _count(inst, t)
            exists_legacy = _table_exists(legacy, t)
            exists_inst = _table_exists(inst, t)
            print(f"{t}: legacy_exists={exists_legacy} legacy_cnt={legacy_cnt} | instance_exists={exists_inst} instance_cnt={inst_cnt}")
            # Safety gate: only drop if destination table exists and has >= rows.
            if exists_legacy and legacy_cnt > 0:
                if not exists_inst or inst_cnt < legacy_cnt:
                    ok_to_drop = False

        if not args.apply:
            print("\nDRY RUN: no changes made. Use --apply to drop legacy tables.")
            if not ok_to_drop:
                print("NOTE: Safety gate would block dropping (instance has fewer rows for at least one table).")
            return 0

        if not ok_to_drop:
            print("ABORT: Safety gate blocked dropping legacy tables.")
            return 3

        if args.backup:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = legacy_db.with_suffix(legacy_db.suffix + f".bak_{ts}")
            shutil.copy2(legacy_db, backup_path)
            print(f"Backup created: {backup_path}")

        print("\n== Dropping legacy tables ==")
        for t in TABLES:
            if _table_exists(legacy, t):
                legacy.execute(f"DROP TABLE IF EXISTS {t}")
                print(f"Dropped: {t}")
        legacy.commit()
        print("Done.")
        return 0
    finally:
        try:
            legacy.close()
        finally:
            inst.close()


if __name__ == "__main__":
    raise SystemExit(main())
