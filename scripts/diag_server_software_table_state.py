"""Diagnose server detail tab02-software table state.

Confirms which SQLite DB file is used and whether the `server_software` table exists.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import sqlalchemy as sa

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import create_app, db
from app.services.server_software_service import init_server_software_table


def main() -> None:
    app = create_app()
    app.app_context().push()

    db_path = init_server_software_table(app)
    print("server_software db_path:", db_path)

    insp = sa.inspect(db.engine)
    tables = set(insp.get_table_names())
    print("SQLAlchemy engine url:", str(db.engine.url))
    print("server_software in SQLAlchemy tables:", "server_software" in tables)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='server_software'"
        )
        row = cur.fetchone()
        print("server_software in sqlite_master:", bool(row))
        if row:
            cols = conn.execute("PRAGMA table_info(server_software)").fetchall()
            print("server_software columns:", [c[1] for c in cols])
            count = conn.execute("SELECT COUNT(*) FROM server_software").fetchone()[0]
            print("server_software rowcount:", count)


if __name__ == "__main__":
    main()
