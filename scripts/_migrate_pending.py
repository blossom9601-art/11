"""Migrate agent_pending from root DB to instance DB"""
import sqlite3, os

root_db = os.path.join(os.getcwd(), 'dev_blossom.db')
inst_db = os.path.join(os.getcwd(), 'instance', 'dev_blossom.db')

# Create tables in instance DB
inst = sqlite3.connect(inst_db)
inst.executescript("""
    CREATE TABLE IF NOT EXISTS hw_interface (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_key TEXT NOT NULL,
        asset_id INTEGER NOT NULL,
        system_name TEXT,
        if_type TEXT,
        slot TEXT,
        port TEXT,
        iface TEXT,
        serial TEXT,
        assign_value TEXT,
        peer_system TEXT,
        peer_port TEXT,
        remark TEXT,
        created_at TEXT,
        created_by TEXT,
        updated_at TEXT,
        updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS asset_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_scope TEXT NOT NULL,
        asset_id INTEGER NOT NULL,
        account_type TEXT,
        account_name TEXT,
        account_password TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS asset_package (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_scope TEXT NOT NULL,
        asset_id INTEGER NOT NULL,
        package_name TEXT NOT NULL,
        version TEXT,
        release TEXT,
        vendor TEXT,
        installed TEXT,
        package_type TEXT,
        identifier TEXT,
        license TEXT,
        vulnerability TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS agent_pending (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hostname TEXT NOT NULL,
        ip_address TEXT,
        os_type TEXT,
        os_version TEXT,
        payload TEXT NOT NULL,
        received_at TEXT NOT NULL,
        is_linked INTEGER NOT NULL DEFAULT 0,
        linked_asset_id INTEGER,
        linked_at TEXT
    );
""")

# Copy pending rows from root DB
src = sqlite3.connect(root_db)
src.row_factory = sqlite3.Row
rows = src.execute('SELECT * FROM agent_pending').fetchall()
print(f"Found {len(rows)} pending rows in root DB")

for r in rows:
    # Check if already exists in instance
    existing = inst.execute(
        'SELECT id FROM agent_pending WHERE hostname=? AND is_linked=?',
        (r['hostname'], r['is_linked'])
    ).fetchone()
    if existing:
        print(f"  Skip {r['hostname']} (already exists)")
        continue

    cols = r.keys()
    col_names = [c for c in cols if c != 'id']
    placeholders = ','.join(['?'] * len(col_names))
    values = [r[c] for c in col_names]
    inst.execute(
        f"INSERT INTO agent_pending ({','.join(col_names)}) VALUES ({placeholders})",
        values
    )
    print(f"  Migrated {r['hostname']}")

inst.commit()

# Verify
inst.row_factory = sqlite3.Row
for r in inst.execute('SELECT id, hostname, ip_address, os_type, is_linked FROM agent_pending').fetchall():
    print(f"  Instance pending: {dict(r)}")

inst.close()
src.close()
print("Done!")
