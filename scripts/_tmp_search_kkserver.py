import sqlite3

conn = sqlite3.connect('instance/dev_blossom.db')
conn.row_factory = sqlite3.Row

# Search for kkserver in ALL tables
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]

print('Searching for kkserver in all tables...')
for tbl in sorted(tables):
    try:
        cols_info = conn.execute(f'PRAGMA table_info({tbl})').fetchall()
        text_cols = [c[1] for c in cols_info if c[2].upper() in ('TEXT', 'VARCHAR', 'CHAR', '')]
        if not text_cols:
            continue
        conditions = ' OR '.join([f'CAST({c} AS TEXT) LIKE ?' for c in text_cols[:5]])
        params = ['%kkserver%'] * min(len(text_cols), 5)
        rows = conn.execute(f'SELECT * FROM {tbl} WHERE {conditions}', params).fetchall()
        if rows:
            print(f'\n  FOUND IN {tbl}:')
            for r in rows:
                print(f'    {dict(r)}')
    except Exception:
        pass

print('\nDone searching.')
conn.close()
