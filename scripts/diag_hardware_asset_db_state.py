import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import sqlite3

from app import create_app
from app.services import hardware_asset_service as has


def main() -> int:
    app = create_app()
    app.app_context().push()

    db_path = has._resolve_db_path()  # noqa: SLF001 (internal helper)
    print("DB_PATH", db_path)

    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT type, name FROM sqlite_master WHERE name IN (?, ?) ORDER BY type, name",
            (has.TABLE_NAME, has.LEGACY_TABLE_NAME),
        ).fetchall()
        print("OBJECTS", rows)

        all_rows = conn.execute(
            "SELECT type, name FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name"
        ).fetchall()
        print("ALL_OBJECTS_COUNT", len(all_rows))
        for t, n in all_rows:
            if n in (has.TABLE_NAME, has.LEGACY_TABLE_NAME):
                continue
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
