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
        with db.engine.connect() as conn:
            rows = conn.execute(sa.text("""
                select id, emp_no, name, role, department_id, department
                from org_user
                where lower(coalesce(role,'')) in ('admin','관리자')
                   or lower(coalesce(emp_no,'')) = 'admin'
                   or upper(coalesce(name,'')) = 'ADMIN'
                order by id asc
                limit 10
            """)).fetchall()

            print('[diag] admin-like profiles:', len(rows))
            for r in rows:
                r = dict(r._mapping)
                dept_id = r.get('department_id')
                dept = (r.get('department') or '').strip()
                dept_norm = dept.lower()

                fk_cnt = 0
                fb_cnt = 0
                if dept_id:
                    fk_cnt = conn.execute(sa.text(
                        'select count(*) from org_user where department_id = :d'
                    ), {'d': dept_id}).scalar_one()

                    if dept and dept != '-':
                        fb_cnt = conn.execute(sa.text("""
                            select count(*) from org_user
                            where department_id = :d
                               or (
                                   department_id is null
                                   and department is not null
                                   and lower(trim(department)) = :dept
                               )
                        """), {'d': dept_id, 'dept': dept_norm}).scalar_one()
                    else:
                        fb_cnt = fk_cnt
                elif dept and dept != '-':
                    fb_cnt = conn.execute(sa.text("""
                        select count(*) from org_user
                        where department is not null
                          and lower(trim(department)) = :dept
                    """), {'dept': dept_norm}).scalar_one()

                print('  ', r)
                print(f"     -> match counts: fk={fk_cnt} with-fallback={fb_cnt}")

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
