"""Check current DB state for asset 27"""
import sqlite3, os

db = os.path.join('instance', 'dev_blossom.db')
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

print("=== hw_interface (asset_id=27) ===")
rows = conn.execute("SELECT id, scope_key, iface, serial, assign_value, created_by FROM hw_interface WHERE asset_id=27").fetchall()
print(f"Total: {len(rows)}")
for r in rows:
    print(f"  {dict(r)}")

print("\n=== asset_account (asset_id=27, not deleted) ===")
rows = conn.execute("SELECT id, asset_scope, system_key, account_name, account_type, is_deleted FROM asset_account WHERE asset_id=27 AND is_deleted=0").fetchall()
print(f"Total: {len(rows)}")
for r in rows:
    print(f"  {dict(r)}")

print("\n=== asset_package (asset_id=27, not deleted) ===")
rows = conn.execute("SELECT count(*) as cnt FROM asset_package WHERE asset_id=27 AND is_deleted=0").fetchone()
print(f"Total: {rows['cnt']}")

print("\n=== agent_pending ===")
for r in conn.execute("SELECT id, hostname, is_linked, linked_asset_id FROM agent_pending").fetchall():
    print(f"  {dict(r)}")

conn.close()
