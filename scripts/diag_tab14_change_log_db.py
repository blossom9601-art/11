"""Diagnostic: verify tab14 change-log table DB path + existence.

Run:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_tab14_change_log_db.py

This script exists to avoid shell quoting issues with python -c.
"""

from __future__ import annotations

import sys
from pathlib import Path
import sqlite3

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _has_table(db_path: str | None, table: str) -> bool:
    if not db_path:
        return False
    p = Path(db_path)
    if not p.exists():
        return False
    with sqlite3.connect(str(p)) as conn:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (table,),
        ).fetchone()
    return bool(row)


def main() -> int:
    from app import create_app, db
    from app.services.tab14_change_log_service import TABLE_NAME, _resolve_db_path, init_tab14_change_log_table

    app = create_app()

    with app.app_context():
        engine_url = str(db.engine.url)
        engine_db = getattr(db.engine.url, "database", None)
        resolved = _resolve_db_path(app)

        print("engine_url=", engine_url)
        print("engine_database=", engine_db)
        print("config.SQLALCHEMY_DATABASE_URI=", app.config.get("SQLALCHEMY_DATABASE_URI"))
        print("tab14_resolved_db_path=", resolved)

        # Ensure table exists where tab14 service points.
        init_tab14_change_log_table(app)

        print("has_table_engine_db=", _has_table(engine_db, TABLE_NAME))
        print("has_table_tab14_db=", _has_table(resolved, TABLE_NAME))

        return 0


if __name__ == "__main__":
    raise SystemExit(main())
