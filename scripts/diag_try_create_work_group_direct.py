import os
import sqlite3
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app import create_app
from app.services.work_group_service import create_work_group, list_work_groups
from app.services.work_status_service import list_work_statuses, create_work_status
from app.services.work_division_service import list_work_divisions, create_work_division
from app.services.org_department_service import list_org_departments, create_org_department


def main() -> int:
    app = create_app()
    app.app_context().push()

    statuses = list_work_statuses(search=None, include_deleted=False)
    if not statuses:
        statuses = [create_work_status({'status_name': 'Diag Status'}, actor='system')]
    status_code = statuses[0].get('status_code')

    divisions = list_work_divisions(search=None, include_deleted=False)
    if not divisions:
        divisions = [create_work_division({'division_name': 'Diag Division'}, actor='system')]
    division_code = divisions[0].get('division_code')

    depts = list_org_departments(search=None, include_deleted=False)
    if not depts:
        depts = [create_org_department({'dept_name': 'Diag Dept'}, actor='system')]
    dept_code = depts[0].get('dept_code')

    print('picked codes:', {'status_code': status_code, 'division_code': division_code, 'dept_code': dept_code})

    payload = {
        'group_name': 'Diag Work Group',
        'status_code': status_code,
        'division_code': division_code,
        'dept_code': dept_code,
        'group_code': 'DIAG_GROUP_CODE_1',
    }

    try:
        created = create_work_group(payload, actor='system')
        print('created work group:', created)
    except sqlite3.IntegrityError as e:
        print('sqlite3.IntegrityError:', repr(e), 'args=', e.args)
        return 2
    except Exception as e:
        print('Exception:', type(e).__name__, e)
        return 3

    groups = list_work_groups(search=None, include_deleted=True)
    print('list_work_groups(include_deleted=True) =>', len(groups))

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
