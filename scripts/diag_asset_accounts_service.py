from __future__ import annotations

import os
import sys
import traceback

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app import create_app
from app.services import asset_account_service


def main() -> int:
    app = create_app()
    app.app_context().push()

    print('SQLALCHEMY_DATABASE_URI:', app.config.get('SQLALCHEMY_DATABASE_URI'))
    path = asset_account_service._resolve_sqlite_db_path(app)
    print('resolved db path:', path)

    try:
        items = asset_account_service.list_accounts(asset_scope='unix', asset_id=1)
        print('list_accounts ok len=', len(items))
        if items:
            print('first item keys:', list(items[0].keys()))
    except Exception as e:
        print('list_accounts ERROR:', repr(e))
        traceback.print_exc()
        return 1

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
