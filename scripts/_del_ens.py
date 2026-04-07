import sqlite3, os, glob

instance = 'instance'
# Check all .db files
for dbf in glob.glob(os.path.join(instance, '**', '*.db'), recursive=True):
    try:
        conn = sqlite3.connect(dbf)
        conn.row_factory = sqlite3.Row
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if 'hw_interface' in tables:
            rows = conn.execute('SELECT * FROM hw_interface').fetchall()
            if rows:
                print(f'=== {dbf} ({len(rows)} rows) ===')
                for r in rows:
                    d = dict(r)
                    print(d)
        conn.close()
    except Exception as e:
        print(f'{dbf}: {e}')
