from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

# Allow running from scripts/ without installing the package.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app
from app.services.vendor_maintenance_service import (
    init_vendor_maintenance_manager_table,
    init_vendor_maintenance_table,
)
from app.services.vendor_maintenance_software_service import (
    init_vendor_maintenance_software_table,
)


def _count_rows(db_path: Path, table: str) -> int | None:
    if not db_path.exists():
        return None
    con = sqlite3.connect(str(db_path))
    try:
        con.row_factory = sqlite3.Row
        row = con.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", (table,)
        ).fetchone()
        if not row:
            return 0
        cnt = con.execute(f"SELECT COUNT(1) AS cnt FROM {table}").fetchone()
        return int(cnt["cnt"] or 0)
    finally:
        con.close()


def main() -> None:
    app = create_app()
    with app.app_context():
        init_vendor_maintenance_table(app)
        init_vendor_maintenance_manager_table(app)
        init_vendor_maintenance_software_table(app)

    instance_db = Path("instance") / "dev_blossom.db"
    legacy_db = Path("dev_blossom.db")

    tables = [
        "biz_vendor_maintenance",
        "biz_vendor_maintenance_manager",
        "biz_vendor_maintenance_software",
    ]

    print("== Row counts after init/migrate ==")
    for t in tables:
        print(
            f"{t}: instance={_count_rows(instance_db, t)} legacy={_count_rows(legacy_db, t)}"
        )


if __name__ == "__main__":
    main()
