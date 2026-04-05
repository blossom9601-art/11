"""Check CPU catalog DB."""
import sqlite3
conn = sqlite3.connect('instance/cmp_cpu_type.db')
conn.row_factory = sqlite3.Row
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print('Tables:', [t[0] for t in tables])
for t in tables:
    name = t[0]
    cnt = conn.execute(f"SELECT COUNT(*) FROM [{name}]").fetchone()[0]
    print(f"  {name}: {cnt} rows")
    if 'cmp_cpu_type' in name.lower():
        rows = conn.execute(f"SELECT * FROM [{name}] LIMIT 3").fetchall()
        for r in rows:
            print('   ', dict(r))
conn.close()
