"""Check and clean old data for asset 27, then verify agent data"""
import sqlite3, os

db = os.path.join('instance', 'dev_blossom.db')
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

# Check current data for asset 27
print("=== hw_interface (asset_id=27) ===")
for r in conn.execute("SELECT id, scope_key, asset_id, iface, slot, port, assign_value, serial, created_by FROM hw_interface WHERE asset_id=27").fetchall():
    print(dict(r))

print("\n=== asset_account (asset_id=27) ===")
for r in conn.execute("SELECT id, asset_scope, asset_id, account_type, account_name, created_at, is_deleted FROM asset_account WHERE asset_id=27").fetchall():
    print(dict(r))

print("\n=== asset_package (asset_id=27) ===")
rows = conn.execute("SELECT id, asset_scope, asset_id, package_name, version, is_deleted FROM asset_package WHERE asset_id=27").fetchall()
print(f"Total: {len(rows)} rows")
for r in rows[:5]:
    print(dict(r))
if len(rows) > 5:
    print(f"  ... and {len(rows)-5} more")

# Check agent_pending linked to asset 27
print("\n=== agent_pending (linked_asset_id=27) ===")
for r in conn.execute("SELECT id, hostname, is_linked, linked_asset_id FROM agent_pending WHERE linked_asset_id=27").fetchall():
    print(dict(r))

conn.close()
