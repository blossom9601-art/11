import sqlite3
from pathlib import Path

DB = Path('/opt/blossom/web/instance/vendor_manufacturer.db')
TARGET_ID = 7

conn = sqlite3.connect(str(DB))
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print('db', DB)
print('tables_with_fk_to_biz_vendor_manufacturer')

tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
for t in tables:
    try:
        fks = cur.execute(f"PRAGMA foreign_key_list({t})").fetchall()
    except Exception:
        continue
    for fk in fks:
        # columns: id, seq, table, from, to, on_update, on_delete, match
        if str(fk[2]).lower() == 'biz_vendor_manufacturer':
            print('fk', t, 'from', fk[3], 'to', fk[4], 'on_update', fk[5], 'on_delete', fk[6])

print('rows_in_target_table')
for row in cur.execute("SELECT id, manufacturer_name, created_by, updated_by, is_deleted FROM biz_vendor_manufacturer ORDER BY id"):
    print(dict(row))

print('possible_references_for_target', TARGET_ID)
candidate_cols = ('vendor_id', 'manufacturer_id', 'vendor_manufacturer_id')
for t in tables:
    try:
        cols = [r[1] for r in cur.execute(f"PRAGMA table_info({t})").fetchall()]
    except Exception:
        continue
    for c in candidate_cols:
        if c in cols:
            try:
                n = cur.execute(f"SELECT COUNT(*) FROM {t} WHERE {c}=?", (TARGET_ID,)).fetchone()[0]
                if n:
                    print('ref', t, c, n)
            except Exception:
                pass

conn.close()
