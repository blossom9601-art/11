import os
import sqlite3
import sys
import traceback

# Ensure repo root is on sys.path so `import app` works when executed from anywhere.
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app import create_app
from app.services import network_ad_service


def main():
    app = create_app()
    app.app_context().push()

    db_path = network_ad_service._resolve_db_path(app)
    print('DB path:', db_path)

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
        print('Tables:', tables)

        for t in (network_ad_service.LEGACY_TABLE_NAME, network_ad_service.TABLE_NAME):
            if t in tables:
                cols = [r[1] for r in conn.execute(f"PRAGMA table_info({t})").fetchall()]
                print(f'Columns[{t}]:', cols)
    finally:
        try:
            conn.close()
        except Exception:
            pass

    try:
        print('Calling init_network_ad_table...')
        network_ad_service.init_network_ad_table(app)
        print('Calling svc_list_network_ads...')
        print(network_ad_service.svc_list_network_ads(page=1, page_size=5, order='-ad_id'))
    except Exception:
        print('ERROR while listing network ADs:')
        traceback.print_exc()


if __name__ == '__main__':
    main()
