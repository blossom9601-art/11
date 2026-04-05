import os
import sqlite3
import sys
from pathlib import Path

# Ensure project root is importable when running from scripts/.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import create_app
from app.services import hardware_asset_service, vendor_manufacturer_service


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (name,),
    ).fetchone()
    return row is not None


def main() -> None:
    app = create_app()
    with app.app_context():
        hw_path = hardware_asset_service._resolve_db_path(app)
        vendor_path = vendor_manufacturer_service._resolve_db_path(app)
        print('SQLALCHEMY_DATABASE_URI:', app.config.get('SQLALCHEMY_DATABASE_URI'))
        print('hardware_asset_service db:', hw_path)
        print('vendor_manufacturer_service db:', vendor_path)
        print('same_db:', os.path.abspath(hw_path) == os.path.abspath(vendor_path))

        for label, path in [('hw', hw_path), ('vendor', vendor_path)]:
            try:
                conn = sqlite3.connect(path)
                try:
                    exists = _table_exists(conn, 'biz_vendor_manufacturer')
                    print(f'{label} has biz_vendor_manufacturer:', exists)
                    if exists:
                        count = conn.execute('SELECT COUNT(1) FROM biz_vendor_manufacturer').fetchone()[0]
                        print(f'{label} biz_vendor_manufacturer rows:', count)
                finally:
                    conn.close()
            except Exception as e:
                print(f'{label} connect failed:', type(e).__name__, e)


if __name__ == '__main__':
    main()
