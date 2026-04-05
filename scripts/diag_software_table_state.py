from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app
from app.services import software_asset_service as sw


def main() -> None:
    app = create_app("development")
    app.app_context().push()

    conn = sw._get_connection(app)  # triggers ensure_schema + legacy migration
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "select name from sqlite_master where type='table' order by name"
            ).fetchall()
        ]

        print("db_path:", sw._resolve_db_path(app))
        print("has software_asset:", sw.TABLE_NAME in tables)
        print("has separate software:", "software" in tables)

        if sw.TABLE_NAME in tables:
            cols = [
                r[1]
                for r in conn.execute(f"pragma table_info({sw.TABLE_NAME})").fetchall()
            ]
            print("software_asset columns:", ",".join(cols))

            idx = [
                r[1]
                for r in conn.execute(f"pragma index_list({sw.TABLE_NAME})").fetchall()
            ]
            print("software_asset indexes:", ",".join(idx))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
