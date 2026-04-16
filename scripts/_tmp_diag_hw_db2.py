import sqlite3

# The service resolves DB to instance/dev_blossom.db based on URI sqlite:///dev_blossom.db
conn = sqlite3.connect('instance/dev_blossom.db')
conn.row_factory = sqlite3.Row

# List all tables
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print('Tables in dev_blossom.db:', tables)

# Check hw tables
for tbl in [t for t in tables if t.startswith('hw_')]:
    rows = conn.execute(f'SELECT id, model_name, is_deleted FROM {tbl} ORDER BY id').fetchall()
    print(f'\n=== {tbl} (total={len(rows)}) ===')
    for r in rows:
        print(dict(r))

conn.close()
