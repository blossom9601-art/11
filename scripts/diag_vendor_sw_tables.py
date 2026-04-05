from __future__ import annotations

import sqlite3
from pathlib import Path


def _inspect_db(db_path: Path) -> dict[str, bool] | None:
    if not db_path.exists():
        return None
    con = sqlite3.connect(str(db_path))
    try:
        tables = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
        return {
            "biz_vendor_manufacturer_software": "biz_vendor_manufacturer_software" in tables,
            "biz_vendor_maintenance_software": "biz_vendor_maintenance_software" in tables,
        }
    finally:
        con.close()


def main() -> None:
    candidates = [Path("instance") / "dev_blossom.db", Path("dev_blossom.db")]
    for p in candidates:
        info = _inspect_db(p)
        if info is None:
            print(f"DB MISSING: {p}")
            continue
        print(f"DB: {p}")
        for k, v in info.items():
            print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
