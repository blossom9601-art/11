import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import sqlalchemy as sa

from app import create_app, db


def main() -> int:
    app = create_app()
    with app.app_context():
        insp = sa.inspect(db.engine)
        tables = set(insp.get_table_names())
        if 'org_user' not in tables:
            print('[diag] org_user table missing')
            return 2
        if 'org_department' not in tables:
            print('[diag] org_department table missing')
            return 2

        with db.engine.connect() as conn:
            total_users = conn.execute(sa.text('select count(*) from org_user')).scalar_one()
            total_depts = conn.execute(sa.text('select count(*) from org_department where is_deleted=0')).scalar_one()
            null_dept_id = conn.execute(sa.text('select count(*) from org_user where department_id is null')).scalar_one()
            dash_dept_str = conn.execute(sa.text("select count(*) from org_user where department is null or trim(department)='' or trim(department)='-'" )).scalar_one()

            print('[diag] org_user total:', total_users)
            print('[diag] org_department (not deleted):', total_depts)
            print('[diag] org_user department_id is NULL:', null_dept_id)
            print("[diag] org_user department string empty/'-':", dash_dept_str)

            # Top dept_id usage
            rows = conn.execute(sa.text(
                """
                select department_id, count(*) as c
                from org_user
                group by department_id
                order by c desc
                limit 10
                """
            )).fetchall()
            print('\n[diag] top department_id counts:')
            for dept_id, c in rows:
                print('  ', dept_id, c)

            # Top dept strings where dept_id is NULL
            rows = conn.execute(sa.text(
                """
                select trim(department) as dept, count(*) as c
                from org_user
                where department_id is null and department is not null and trim(department) != '' and trim(department) != '-'
                group by trim(department)
                order by c desc
                limit 10
                """
            )).fetchall()
            print('\n[diag] top department strings (dept_id NULL):')
            for dept, c in rows:
                print('  ', dept, c)

            # Dept_id exists but string is '-'
            rows = conn.execute(sa.text(
                """
                select emp_no, name, department_id, department
                from org_user
                where department_id is not null and (department is null or trim(department)='' or trim(department)='-')
                limit 20
                """
            )).fetchall()
            print("\n[diag] examples: department_id set but department string empty/'-':", len(rows))
            for emp_no, name, department_id, department in rows:
                print('  ', emp_no, name, department_id, department)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
