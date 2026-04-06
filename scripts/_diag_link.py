"""Diagnose agent link issue"""
import sqlite3, os

db = os.path.join('instance', 'dev_blossom.db')
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

# Check which tables exist
tables = [r[0] for r in conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('hardware','hardware_asset')"
).fetchall()]
print('Tables found:', tables)

for t in tables:
    cols = [r[1] for r in conn.execute(f'PRAGMA table_info({t})').fetchall()]
    has_disposed = 'is_disposed' in cols
    where = 'is_deleted=0'
    if has_disposed:
        where += ' AND is_disposed=0'
    rows = conn.execute(
        f"SELECT id, asset_category, asset_type, system_name, asset_name FROM {t} WHERE {where} LIMIT 5"
    ).fetchall()
    print(f'\n{t} (has_disposed={has_disposed}): {len(rows)} rows (showing up to 5)')
    for r in rows:
        print(' ', dict(r))

# Check pending
print('\n--- agent_pending ---')
for r in conn.execute('SELECT * FROM agent_pending').fetchall():
    print(' ', dict(r))

conn.close()
