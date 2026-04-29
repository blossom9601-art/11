import sqlite3
from pathlib import Path

DB = Path('/opt/blossom/web/instance/vendor_manufacturer.db')
conn = sqlite3.connect(str(DB))
cur = conn.cursor()

print('schema_biz_vendor_manufacturer')
row = cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='biz_vendor_manufacturer'").fetchone()
print(row[0] if row else 'NOT_FOUND')

print('foreign_key_list_biz_vendor_manufacturer')
for fk in cur.execute("PRAGMA foreign_key_list(biz_vendor_manufacturer)").fetchall():
    print(fk)

print('rows')
for r in cur.execute("SELECT id, manufacturer_name, created_by, updated_by, is_deleted FROM biz_vendor_manufacturer ORDER BY id").fetchall():
    print(r)

conn.close()
