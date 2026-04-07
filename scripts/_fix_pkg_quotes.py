"""기존 asset_package 테이블에서 version/vendor 필드의 따옴표 제거"""
import sqlite3

conn = sqlite3.connect("instance/dev_blossom.db")
conn.row_factory = sqlite3.Row

rows = conn.execute(
    "SELECT id, version, vendor FROM asset_package WHERE version LIKE '%\"%' OR vendor LIKE '%\"%'"
).fetchall()
print(f"Rows with quotes: {len(rows)}")
for r in rows[:10]:
    print(f"  id={r['id']} version={r['version']!r} vendor={r['vendor']!r}")

conn.execute("UPDATE asset_package SET version = TRIM(REPLACE(version, '\"', '')) WHERE version LIKE '%\"%'")
conn.execute("UPDATE asset_package SET vendor = TRIM(REPLACE(vendor, '\"', '')) WHERE vendor LIKE '%\"%'")
conn.commit()

rows2 = conn.execute(
    "SELECT id, version, vendor FROM asset_package WHERE version LIKE '%\"%' OR vendor LIKE '%\"%'"
).fetchall()
print(f"After fix: {len(rows2)}")
conn.close()
print("Done")
