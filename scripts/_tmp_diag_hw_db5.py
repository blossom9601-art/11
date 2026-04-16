import sqlite3

# Check the standalone hw_server_type.db
print('=== Standalone hw_server_type.db ===')
conn = sqlite3.connect('instance/hw_server_type.db')
conn.row_factory = sqlite3.Row
rows = conn.execute('SELECT * FROM hw_server_type ORDER BY id').fetchall()
print(f'Total rows: {len(rows)}')
for r in rows:
    print(dict(r))
conn.close()

# Verify which DB path Flask would resolve when running
import os, sys
sys.path.insert(0, '.')

# Simulate the _resolve_db_path logic for dev mode
uri = 'sqlite:///dev_blossom.db'
from urllib.parse import urlparse
parsed = urlparse(uri)
path = parsed.path
netloc = parsed.netloc
print(f'\nURI: {uri}')
print(f'parsed.path: {path!r}')
print(f'parsed.netloc: {netloc!r}')
print(f'os.path.isabs: {os.path.isabs(path)}')
if os.path.isabs(path):
    normalized = path.replace('\\', '/')
    if normalized.startswith('/') and normalized.count('/') == 1:
        filename = normalized.lstrip('/')
        instance_path = os.path.abspath('instance')
        resolved = os.path.abspath(os.path.join(instance_path, filename))
        print(f'Resolved DB path: {resolved}')
    else:
        print(f'Resolved as absolute: {os.path.abspath(path)}')
else:
    relative = path.lstrip('/')
    instance_path = os.path.abspath('instance')
    resolved = os.path.abspath(os.path.join(instance_path, relative))
    print(f'Resolved DB path: {resolved}')
