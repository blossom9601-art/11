import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

test_script = """
import sqlite3, os

db_path = '/opt/blossom/web/instance/dev_blossom.db'
conn = sqlite3.connect(db_path)

# All tables in DB
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
print(f'Total tables: {len(tables)}')

# Check required lookup tables
required = [
    'biz_work_category', 'biz_work_division', 'biz_work_status',
    'biz_work_operation', 'biz_work_group', 'biz_vendor_manufacturer',
    'hw_server_type', 'org_center', 'org_rack', 'org_department',
    'hardware',
]
print()
for t in required:
    exists = t in tables
    count = 0
    if exists:
        count = conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'  {t}: {"EXISTS" if exists else "MISSING"} ({count} rows)')

# Also list all biz_* and hw_* and org_* tables
print()
print('All biz_* tables:', [t for t in tables if t.startswith('biz_')])
print('All hw_* tables:', [t for t in tables if t.startswith('hw_')])
print('All org_* tables:', [t for t in tables if t.startswith('org_')])

conn.close()
"""

sftp = ssh.open_sftp()
with sftp.open('/tmp/_check_tables.py', 'w') as f:
    f.write(test_script)
sftp.close()

_, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python3 /tmp/_check_tables.py', timeout=10)
print(o.read().decode())
err = e.read().decode()
if err.strip():
    print("ERR:", err[:500])

ssh.close()
