"""Diagnose bay-server-lookup: check hardware table and data."""
import sqlite3, os, sys, glob

DB_PATH = 'instance/blossom.db'

def main():
    if not os.path.exists(DB_PATH):
        print(f'DB not found at {DB_PATH}')
        return

    conn = sqlite3.connect(DB_PATH)

    # List all tables
    tables = [t[0] for t in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()]
    hw_tables = [t for t in tables if 'hardware' in t.lower() or 'hw_' in t.lower() or 'asset' in t.lower()]
    print('HW/asset tables:', hw_tables)

    # Check hardware_asset table (common name pattern)
    for tn in ['hardware', 'hardware_asset', 'hardware_assets', 'hw_asset']:
        if tn in tables:
            print(f'\nFound table: {tn}')
            cols = [c[1] for c in conn.execute(f"PRAGMA table_info({tn})").fetchall()]
            print(f'  Columns: {cols}')
            count = conn.execute(f"SELECT COUNT(*) FROM {tn}").fetchone()[0]
            print(f'  Total rows: {count}')
            if 'asset_type' in cols:
                types = conn.execute(f"SELECT DISTINCT asset_type FROM {tn}").fetchall()
                print(f'  Asset types: {[r[0] for r in types]}')
            if 'work_name' in cols:
                wns = conn.execute(f"SELECT DISTINCT work_name FROM {tn} WHERE work_name IS NOT NULL AND TRIM(work_name) != ''").fetchall()
                print(f'  Distinct work_names: {[r[0] for r in wns[:20]]}')
            if 'is_deleted' in cols and 'asset_type' in cols:
                op = conn.execute(f"SELECT COUNT(*) FROM {tn} WHERE is_deleted=0 AND asset_type='ON_PREMISE'").fetchone()[0]
                print(f'  ON_PREMISE (not deleted): {op}')
            if 'is_disposed' in cols and 'asset_type' in cols:
                op2 = conn.execute(f"SELECT COUNT(*) FROM {tn} WHERE is_deleted=0 AND is_disposed=0 AND asset_type='ON_PREMISE'").fetchone()[0]
                print(f'  ON_PREMISE (not deleted, not disposed): {op2}')
            break

    # Also check the service TABLE_NAME
    sys.path.insert(0, '.')
    try:
        from app.services.hardware_asset_service import TABLE_NAME
        print(f'\nhardware_asset_service.TABLE_NAME = {TABLE_NAME!r}')
        if TABLE_NAME in tables:
            print(f'  Table {TABLE_NAME} EXISTS in DB')
        else:
            print(f'  *** Table {TABLE_NAME} NOT FOUND in DB ***')
    except Exception as e:
        print(f'  Could not import TABLE_NAME: {e}')

    # Check which DB file the service actually uses
    try:
        from app.services.hardware_asset_service import DB_PATH as svc_db
        print(f'  Service DB_PATH = {svc_db!r}')
    except ImportError:
        pass
    try:
        from app.services.hardware_asset_service import _get_connection
        print(f'  _get_connection function found')
    except ImportError:
        pass

    # List ALL tables
    print(f'\nAll tables in {DB_PATH}:')
    for t in tables:
        print(f'  {t}')

    # Check if hardware table is in a different DB
    for dbf in glob.glob('instance/*.db'):
        c2 = sqlite3.connect(dbf)
        t2 = [t[0] for t in c2.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if 'hardware' in t2:
            print(f'\n*** Table "hardware" found in {dbf} ***')
            cols = [c[1] for c in c2.execute("PRAGMA table_info(hardware)").fetchall()]
            count = c2.execute("SELECT COUNT(*) FROM hardware").fetchone()[0]
            print(f'  Columns: {cols[:15]}...')
            print(f'  Total rows: {count}')
            if 'asset_type' in cols:
                types = c2.execute("SELECT DISTINCT asset_type FROM hardware").fetchall()
                print(f'  Asset types: {[r[0] for r in types]}')
            if 'work_name' in cols and 'is_deleted' in cols:
                wns = c2.execute("SELECT DISTINCT work_name FROM hardware WHERE is_deleted=0 AND work_name IS NOT NULL AND TRIM(work_name) != ''").fetchall()
                print(f'  Distinct work_names (active): {[r[0] for r in wns[:20]]}')
        c2.close()

    conn.close()

if __name__ == '__main__':
    main()
