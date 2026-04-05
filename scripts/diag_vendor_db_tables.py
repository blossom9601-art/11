from __future__ import annotations

import sqlite3
from pathlib import Path

TABLES = [
    "biz_vendor_manufacturer",
    "biz_vendor_manufacturer_software",
    "biz_vendor_maintenance",
    "biz_vendor_maintenance_software",
]


def main() -> None:
    candidates = [Path("instance") / "dev_blossom.db", Path("dev_blossom.db")]
    for p in candidates:
        if not p.exists():
            print(f"DB MISSING: {p}")
            continue
        con = sqlite3.connect(str(p))
        try:
            tables = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
        finally:
            con.close()

        print(f"DB: {p}")
        for t in TABLES:
            print(f"  {t}: {t in tables}")


if __name__ == "__main__":
    main()
