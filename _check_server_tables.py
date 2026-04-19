import sqlite3
c = sqlite3.connect('instance/blossom.db')
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
for t in sorted(tables):
    if 'server' in t.lower() or 'onprem' in t.lower() or 'hardware' in t.lower():
        print(t)
        rows = c.execute(f"SELECT * FROM {t} LIMIT 1").fetchall()
        if rows:
            cols = [d[0] for d in c.execute(f"SELECT * FROM {t} LIMIT 0").description]
            print(f"  cols: {cols[:5]}")
            print(f"  row: {rows[0][:5]}")
c.close()
