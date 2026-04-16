import sqlite3

conn = sqlite3.connect('instance/dev_blossom.db')
conn.row_factory = sqlite3.Row

# Search for kkserver in all hw tables
print('=== Searching for kkserver ===')
for tbl in ['hw_server_type', 'hw_storage_type', 'hw_san_type', 'hw_network_type', 'hw_security_type']:
    try:
        # Get columns first
        cols = [c[1] for c in conn.execute(f'PRAGMA table_info({tbl})').fetchall()]
        text_cols = [c for c in cols if 'name' in c.lower() or 'model' in c.lower() or 'code' in c.lower()]
        if not text_cols:
            text_cols = cols[:3]
        for tc in text_cols:
            rows = conn.execute(f"SELECT * FROM {tbl} WHERE {tc} LIKE '%kk%'").fetchall()
            if rows:
                print(f'  {tbl}.{tc}: {[dict(r) for r in rows]}')
    except Exception as e:
        print(f'  {tbl}: {e}')

# Show ALL active rows from hw_server_type with their form_factor distribution
print('\n=== Active hw_server_type by form_factor ===')
rows = conn.execute(
    'SELECT form_factor, COUNT(*) as cnt FROM hw_server_type WHERE is_deleted=0 GROUP BY form_factor ORDER BY cnt DESC'
).fetchall()
for r in rows:
    print(dict(r))

# Show hw_storage_type active rows
print('\n=== Active hw_storage_type ===')
try:
    cols = [c[1] for c in conn.execute('PRAGMA table_info(hw_storage_type)').fetchall()]
    print('columns:', cols)
    rows = conn.execute('SELECT * FROM hw_storage_type WHERE is_deleted=0').fetchall()
    for r in rows:
        print(dict(r))
except Exception as e:
    print(f'hw_storage_type: {e}')

# Show hw_san_type active rows
print('\n=== Active hw_san_type ===')
try:
    cols = [c[1] for c in conn.execute('PRAGMA table_info(hw_san_type)').fetchall()]
    print('columns:', cols)
    rows = conn.execute('SELECT * FROM hw_san_type WHERE is_deleted=0').fetchall()
    for r in rows:
        print(dict(r))
except Exception as e:
    print(f'hw_san_type: {e}')

# hw_network_type
print('\n=== Active hw_network_type ===')
try:
    cols = [c[1] for c in conn.execute('PRAGMA table_info(hw_network_type)').fetchall()]
    print('columns:', cols[:5])
    rows = conn.execute('SELECT id, model_name, is_deleted FROM hw_network_type WHERE is_deleted=0').fetchall()
    for r in rows:
        print(dict(r))
except Exception as e:
    print(f'hw_network_type: {e}')

# hw_security_type
print('\n=== Active hw_security_type ===')
try:
    rows = conn.execute('SELECT id, model_name, is_deleted FROM hw_security_type WHERE is_deleted=0').fetchall()
    for r in rows:
        print(dict(r))
except Exception as e:
    print(f'hw_security_type: {e}')

conn.close()
