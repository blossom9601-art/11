import sqlite3
conn = sqlite3.connect("instance/dev_blossom.db")
conn.row_factory = sqlite3.Row
rows = conn.execute(
    "SELECT package_name, package_type, license FROM asset_package WHERE license != '' AND is_deleted = 0 ORDER BY package_name"
).fetchall()
print(f"Packages with license: {len(rows)}")
for r in rows:
    print(f"  {r['package_name']:30s} {r['package_type']:5s} {r['license']}")
conn.close()
