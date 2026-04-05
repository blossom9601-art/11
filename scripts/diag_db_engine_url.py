"""Diagnostic: print SQLAlchemy engine URL and SQLite path.

This exists because PowerShell quoting/parsing can break one-liner `python -c`.
Run:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_db_engine_url.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def main() -> int:
    from app import create_app, db

    app = create_app()

    with app.app_context():
        engine_url = str(db.engine.url)
        database = getattr(db.engine.url, "database", None)

        print("engine_url=", engine_url)
        print("database=", database)

        if database:
            db_path = Path(database)
            print("database_exists=", db_path.exists())
            if db_path.exists():
                print("database_size_bytes=", db_path.stat().st_size)

        instance_path = Path(app.instance_path)
        print("instance_path=", str(instance_path))
        print("instance_exists=", instance_path.exists())

        cfg_uri = app.config.get("SQLALCHEMY_DATABASE_URI")
        if cfg_uri:
            print("config.SQLALCHEMY_DATABASE_URI=", cfg_uri)

        # Helpful env vars when DB differs by environment.
        for key in ("FLASK_ENV", "FLASK_APP", "DATABASE_URL"):
            if key in os.environ:
                print(f"env.{key}=", os.environ.get(key))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
