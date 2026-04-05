"""Diagnostic: department_id migration + calendar department scope.

This script was originally embedded in a VS Code task via PowerShell heredoc.
It is now a standalone Python script so tasks can run without PowerShell.
"""

from __future__ import annotations

import sqlalchemy as sa

from app import create_app, db


def main() -> int:
    app = create_app()
    app.app_context().push()

    insp = sa.inspect(db.engine)
    org_user_cols = {c["name"] for c in insp.get_columns("org_user")}
    print("org_user has department_id:", "department_id" in org_user_cols)

    with db.engine.connect() as conn:
        total_users = conn.execute(sa.text("select count(*) from org_user")).scalar_one()
        users_with_dept_str = conn.execute(
            sa.text(
                "select count(*) from org_user where department is not null and trim(department) != ''"
            )
        ).scalar_one()
        users_with_dept_id = conn.execute(
            sa.text("select count(*) from org_user where department_id is not null")
        ).scalar_one()
        dept_rows = conn.execute(sa.text("select count(*) from org_department")).scalar_one()

        tables = set(insp.get_table_names())
        cal_total = (
            conn.execute(sa.text("select count(*) from cal_schedule")).scalar_one()
            if "cal_schedule" in tables
            else 0
        )
        cal_dept = (
            conn.execute(
                sa.text("select count(*) from cal_schedule where share_scope='DEPARTMENT'")
            ).scalar_one()
            if cal_total
            else 0
        )
        cal_dept_missing_owner = (
            conn.execute(
                sa.text(
                    "select count(*) from cal_schedule where share_scope='DEPARTMENT' and owner_dept_id is null"
                )
            ).scalar_one()
            if cal_total
            else 0
        )

    print("org_department rows:", dept_rows)
    print("org_user total:", total_users)
    print("org_user with department(string):", users_with_dept_str)
    print("org_user with department_id(FK):", users_with_dept_id)
    print("cal_schedule total:", cal_total)
    print("cal_schedule DEPARTMENT:", cal_dept)
    print("cal_schedule DEPARTMENT missing owner_dept_id:", cal_dept_missing_owner)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
