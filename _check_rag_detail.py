import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

# 1. Check insight items with attachments
script1 = r"""
import sqlite3, os, json

# Find insight items
db = '/opt/blossom/web/instance/blossom.db'
c = sqlite3.connect(db)
c.row_factory = sqlite3.Row
rows = c.execute("SELECT id, title, category FROM insight_items ORDER BY id DESC LIMIT 5").fetchall()
print('=== insight_items ===')
for r in rows:
    print(dict(r))
c.close()

# Check attachments
db2 = '/opt/blossom/web/instance/blossom.db'
c2 = sqlite3.connect(db2)
c2.row_factory = sqlite3.Row
rows2 = c2.execute("SELECT * FROM insight_item_attachments ORDER BY id DESC LIMIT 5").fetchall()
print('\n=== attachments ===')
for r in rows2:
    print(dict(r))
c2.close()

# Check upload dirs
base = '/opt/blossom/web/uploads/insight_items'
if os.path.isdir(base):
    print('\n=== upload dirs ===')
    for d in os.listdir(base):
        full = os.path.join(base, d)
        if os.path.isdir(full):
            files = os.listdir(full)
            print(f'  {d}/: {files}')
else:
    print('\n=== uploads dir NOT FOUND ===')
    # try alternative
    for p in ['/opt/blossom/web/uploads', '/opt/blossom/web/instance/uploads']:
        print(f'  {p} exists: {os.path.isdir(p)}')
"""

_, o, e = s.exec_command(f'cd /opt/blossom/web && python3 -c """{script1}"""')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('STDERR:', err)

# 2. Check blossom-web recent logs for enqueue errors
_, o, e = s.exec_command('journalctl -u blossom-web --no-pager -n 30 --since "2 min ago" 2>&1')
print('\n=== recent logs ===')
print(o.read().decode())

s.close()
