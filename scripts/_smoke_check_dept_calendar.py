from __future__ import annotations

import sys
from pathlib import Path

import sqlalchemy as sa

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import create_app, db
from app.services import org_department_service


def main() -> None:
    app = create_app()
    app.app_context().push()

    insp = sa.inspect(db.engine)
    print('SQLAlchemy db file:', getattr(db.engine.url, 'database', None))
    org_user_cols = {c["name"] for c in insp.get_columns("org_user")}
    print("org_user has department_id:", "department_id" in org_user_cols)

    tables = set(insp.get_table_names())

    with db.engine.connect() as conn:
        dept_rows = conn.execute(sa.text("select count(*) from org_department")).scalar_one()
        total_users = conn.execute(sa.text("select count(*) from org_user")).scalar_one()
        users_with_dept_str = conn.execute(
            sa.text(
                "select count(*) from org_user where department is not null and trim(department) != ''"
            )
        ).scalar_one()
        users_with_dept_id = conn.execute(
            sa.text("select count(*) from org_user where department_id is not null")
        ).scalar_one()

        if "cal_schedule" in tables:
            cal_total = conn.execute(sa.text("select count(*) from cal_schedule")).scalar_one()
            cal_dept = conn.execute(
                sa.text("select count(*) from cal_schedule where share_scope='DEPARTMENT'")
            ).scalar_one()
            cal_dept_missing_owner = conn.execute(
                sa.text(
                    "select count(*) from cal_schedule "
                    "where share_scope='DEPARTMENT' and owner_dept_id is null"
                )
            ).scalar_one()
        else:
            cal_total = 0
            cal_dept = 0
            cal_dept_missing_owner = 0

    print("org_department rows:", dept_rows)
    print("org_user total:", total_users)
    print("org_user with department(string):", users_with_dept_str)
    print("org_user with department_id(FK):", users_with_dept_id)
    print("cal_schedule total:", cal_total)
    print("cal_schedule DEPARTMENT:", cal_dept)
    print("cal_schedule DEPARTMENT missing owner_dept_id:", cal_dept_missing_owner)

    # Also check the legacy sqlite-backed org_department_service storage
    svc_path = org_department_service._resolve_db_path(app)
    svc_count = None
    try:
        import sqlite3

        conn = sqlite3.connect(svc_path)
        try:
            row = conn.execute("SELECT COUNT(*) FROM org_department").fetchone()
            svc_count = int(row[0]) if row else 0
        finally:
            conn.close()
    except Exception as exc:
        print("org_department_service db_path:", svc_path)
        print("org_department_service count: ERROR", repr(exc))
    else:
        print("org_department_service db_path:", svc_path)
        print("org_department_service rows:", svc_count)

    # Explicitly compare common SQLite locations
    root_db = REPO_ROOT / 'dev_blossom.db'
    instance_db = REPO_ROOT / 'instance' / 'dev_blossom.db'

    def _count_org_department(path: Path) -> str:
        try:
            import sqlite3

            conn = sqlite3.connect(str(path))
            try:
                row = conn.execute('SELECT COUNT(*) FROM org_department').fetchone()
                return str(int(row[0]) if row else 0)
            finally:
                conn.close()
        except Exception as exc:
            return f"ERROR {exc!r}"

    print('root dev_blossom.db:', str(root_db), 'org_department rows:', _count_org_department(root_db))
    print('instance dev_blossom.db:', str(instance_db), 'org_department rows:', _count_org_department(instance_db))


if __name__ == "__main__":
    main()
