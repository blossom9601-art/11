import sqlite3

conn = sqlite3.connect('instance/dev_blossom.db')
conn.row_factory = sqlite3.Row

server_form_factors = ['서버', '물리서버', '온프레미스', '클라우드', '프레임', '가상서버', '워크스테이션']

# hw_server_type: show form_factors of active rows
rows = conn.execute('SELECT id, model_name, form_factor, is_deleted FROM hw_server_type ORDER BY id').fetchall()
print(f'=== hw_server_type (total={len(rows)}) ===')
active_server = []
for r in rows:
    d = dict(r)
    in_ff = d['form_factor'] in server_form_factors
    marker = '<<SERVER_FF>>' if in_ff else ''
    print(f"  id={d['id']} model={d['model_name']!r:30} ff={d['form_factor']!r:15} deleted={d['is_deleted']} {marker}")
    if d['is_deleted'] == 0 and in_ff:
        active_server.append(d)

print(f'\nActive server (matching form_factors): {len(active_server)} rows')

# hw_storage_type
try:
    rows = conn.execute('SELECT id, is_deleted FROM hw_storage_type ORDER BY id').fetchall()
    active = [r for r in rows if r['is_deleted'] == 0]
    print(f'\n=== hw_storage_type: total={len(rows)}, active={len(active)} ===')
except Exception as e:
    print(f'hw_storage_type: {e}')

# hw_san_type
try:
    rows = conn.execute('SELECT id, is_deleted FROM hw_san_type ORDER BY id').fetchall()
    active = [r for r in rows if r['is_deleted'] == 0]
    print(f'=== hw_san_type: total={len(rows)}, active={len(active)} ===')
except Exception as e:
    print(f'hw_san_type: {e}')

# hw_network_type
try:
    rows = conn.execute('SELECT id, is_deleted FROM hw_network_type ORDER BY id').fetchall()
    active = [r for r in rows if r['is_deleted'] == 0]
    print(f'=== hw_network_type: total={len(rows)}, active={len(active)} ===')
except Exception as e:
    print(f'hw_network_type: {e}')

# hw_security_type
try:
    rows = conn.execute('SELECT id, is_deleted FROM hw_security_type ORDER BY id').fetchall()
    active = [r for r in rows if r['is_deleted'] == 0]
    print(f'=== hw_security_type: total={len(rows)}, active={len(active)} ===')
except Exception as e:
    print(f'hw_security_type: {e}')

conn.close()
