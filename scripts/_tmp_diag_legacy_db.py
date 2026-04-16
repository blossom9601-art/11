import sqlite3

# Check legacy dev_blossom.db at project root
conn = sqlite3.connect('dev_blossom.db')
conn.row_factory = sqlite3.Row

hw_tables = ['hw_server_type', 'hw_storage_type', 'hw_san_type', 'hw_network_type', 'hw_security_type']
for tbl in hw_tables:
    try:
        rows = conn.execute(f'SELECT COUNT(*) AS cnt FROM {tbl}').fetchone()
        active = conn.execute(f'SELECT COUNT(*) AS cnt FROM {tbl} WHERE is_deleted=0').fetchone()
        print(f'{tbl}: total={rows["cnt"]}, active={active["cnt"]}')
        # Show active rows
        active_rows = conn.execute(f'SELECT id, model_name, is_deleted FROM {tbl} WHERE is_deleted=0').fetchall()
        for r in active_rows:
            print(f'  id={r["id"]} model={r["model_name"]!r}')
    except Exception as e:
        print(f'{tbl}: {e}')

conn.close()
