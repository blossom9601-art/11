"""Diagnose interface/account/package data for asset 27"""
import sqlite3, os

db = os.path.join('instance', 'dev_blossom.db')
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

print("=== hw_interface (asset_id=27) ===")
rows = conn.execute("SELECT * FROM hw_interface WHERE asset_id=27").fetchall()
print(f"Total: {len(rows)}")
for r in rows:
    print(f"  id={r['id']} scope={r['scope_key']} iface={r['iface']} slot={r['slot']} port={r['port']} serial={r['serial']} assign={r['assign_value']} by={r['created_by']}")

print("\n=== asset_account (asset_id=27, is_deleted=0) ===")
rows = conn.execute("SELECT * FROM asset_account WHERE asset_id=27 AND is_deleted=0").fetchall()
print(f"Total: {len(rows)}")
for r in rows:
    print(f"  id={r['id']} scope={r['asset_scope']} name={r['account_name']} type={r['account_type']}")

# Check what scope the interface tab uses
print("\n=== Check scope_key patterns ===")
rows = conn.execute("SELECT DISTINCT scope_key FROM hw_interface WHERE asset_id=27").fetchall()
print("Interface scope_keys:", [r[0] for r in rows])

# Check hardware table for asset 27 category/type
row = conn.execute("SELECT id, asset_category, asset_type FROM hardware WHERE id=27").fetchone()
if row:
    print(f"\nhardware id=27: category={row['asset_category']} type={row['asset_type']}")

# Check all scope patterns used
print("\n=== asset_account scopes for asset 27 ===")
rows = conn.execute("SELECT DISTINCT asset_scope FROM asset_account WHERE asset_id=27").fetchall()
print("Account scopes:", [r[0] for r in rows])

print("\n=== asset_package (asset_id=27, is_deleted=0) ===")
cnt = conn.execute("SELECT COUNT(*) FROM asset_package WHERE asset_id=27 AND is_deleted=0").fetchone()[0]
print(f"Total: {cnt}")

conn.close()
