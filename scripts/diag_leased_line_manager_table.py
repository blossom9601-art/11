from __future__ import annotations

import sys
from pathlib import Path

import sqlalchemy as sa


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def main() -> None:
    from app import create_app, db

    app = create_app()
    app.app_context().push()

    insp = sa.inspect(db.engine)
    tables = set(insp.get_table_names())

    print("db url:", db.engine.url)
    print("has net_leased_line_manager:", "net_leased_line_manager" in tables)

    if "net_leased_line_manager" in tables:
        cols = [c["name"] for c in insp.get_columns("net_leased_line_manager")]
        print("cols:", cols)


if __name__ == "__main__":
    main()
