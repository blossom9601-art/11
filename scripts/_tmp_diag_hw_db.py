import sqlite3

# Check blossom.db
conn = sqlite3.connect('instance/blossom.db')
sql = "SELECT name FROM sqlite_master WHERE type='table'"
tables = [r[0] for r in conn.execute(sql).fetchall()]
hw = [t for t in tables if 'hw' in t.lower() or 'server' in t.lower()]
print('hw-related tables in blossom.db:', hw)
conn.close()

# Check hw_server_type.db full picture
conn = sqlite3.connect('instance/hw_server_type.db')
conn.row_factory = sqlite3.Row
rows = conn.execute('SELECT * FROM hw_server_type ORDER BY id').fetchall()
print('\n=== hw_server_type (all rows) ===')
for r in rows:
    print(dict(r))
conn.close()

# Check category_dashboard_service what it actually queries
print('\nDone')
