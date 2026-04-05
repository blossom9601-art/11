"""Quick check: hw_firewalld table exists in the active SQLite DB.

Prints:
- DB path
- table existence
- columns
- row count

Stdlib only.
"""

from __future__ import annotations

import os
import sqlite3


def main() -> int:
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "dev_blossom.db"))
    print("DB:", db_path)
    if not os.path.exists(db_path):
        print("[FAIL] DB file not found")
        return 2

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='hw_firewalld'")
        row = cur.fetchone()
        print("has hw_firewalld table:", bool(row))
        if not row:
            return 3

        cur.execute("PRAGMA table_info(hw_firewalld)")
        cols = [r[1] for r in cur.fetchall()]
        print("columns:", cols)

        cur.execute("SELECT COUNT(*) FROM hw_firewalld")
        print("rowcount:", cur.fetchone()[0])
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
