from __future__ import annotations

import sys
from pathlib import Path

import sqlalchemy as sa

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import create_app, db


def main() -> None:
    app = create_app()
    app.app_context().push()

    insp = sa.inspect(db.engine)
    print("DB:", db.engine.url)
    print("alembic heads should include blog migration")
    print("has blog table:", insp.has_table("blog"))

    tables = insp.get_table_names()
    print("tables containing 'blog':", [t for t in tables if "blog" in t.lower()])

    if insp.has_table("blog"):
        cols = [c["name"] for c in insp.get_columns("blog")]
        print("blog columns:", cols)


if __name__ == "__main__":
    main()
