import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

test_script = """
import sqlite3, os, sys

# Check auxiliary DB files
instance = '/opt/blossom/web/instance'
aux_dbs = ['org_center.db', 'org_rack.db', 'org_department.db']
for f in aux_dbs:
    p = os.path.join(instance, f)
    if os.path.exists(p):
        sz = os.path.getsize(p)
        conn2 = sqlite3.connect(p)
        tbls = [r[0] for r in conn2.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print(f'{f}: {sz} bytes, tables={tbls}')
        conn2.close()
    else:
        print(f'{f}: DOES NOT EXIST')

# List ALL files in instance/
print()
print('All files in instance/:')
for f in sorted(os.listdir(instance)):
    p = os.path.join(instance, f)
    sz = os.path.getsize(p)
    print(f'  {f} ({sz} bytes)')

# Check which DB the test_client uses
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
from app import create_app
app = create_app()
with app.app_context():
    print(f'\\napp.instance_path: {app.instance_path}')
    print(f'SQLALCHEMY_DATABASE_URI: {app.config.get("SQLALCHEMY_DATABASE_URI")}')
    
    # Now check what _resolve_db_path returns
    from app.services.hardware_asset_service import _resolve_db_path
    db_path = _resolve_db_path(app)
    print(f'_resolve_db_path: {db_path}')
    
    # Check the resolved DB
    conn = sqlite3.connect(db_path)
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
    print(f'Tables in resolved DB: {len(tables)}')
    has_hw = 'hardware' in tables
    has_bwc = 'biz_work_category' in tables
    has_oc = 'org_center' in tables
    print(f'hardware: {has_hw}, biz_work_category: {has_bwc}, org_center: {has_oc}')
    conn.close()
"""

sftp = ssh.open_sftp()
with sftp.open('/tmp/_check_aux.py', 'w') as f:
    f.write(test_script)
sftp.close()

_, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python3 /tmp/_check_aux.py', timeout=15)
print(o.read().decode())
err = e.read().decode()
if err.strip():
    for line in err.split('\n'):
        if any(k in line for k in ['Error', 'Traceback', '  File', 'Import']):
            print(line)

ssh.close()
