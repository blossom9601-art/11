import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

test_script = """
import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')

from app import create_app
app = create_app()

with app.app_context():
    from app.services.hardware_asset_service import _resolve_db_path
    db_path = _resolve_db_path(app)
    print('Resolved DB path:', db_path)

with app.test_client() as c:
    c.post('/api/auth/login', json={'employee_id':'admin','password':'admin1234!'})
    r = c.get('/api/hardware/onpremise/assets')
    print('Status:', r.status_code)
    data = r.get_json()
    if data:
        print('Success:', data.get('success'))
        print('Total:', data.get('total'))
        err = data.get('error')
        if err:
            print('Error:', err)
        items = data.get('items', data.get('rows', []))
        print('Items count:', len(items))
"""

sftp = ssh.open_sftp()
with sftp.open('/tmp/_test_fix.py', 'w') as f:
    f.write(test_script)
sftp.close()

_, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python3 /tmp/_test_fix.py', timeout=30)
print(o.read().decode())
err = e.read().decode()
if err.strip():
    for line in err.split('\n'):
        if any(k in line for k in ['Error', 'Traceback', '  File', 'Import', 'error']):
            print(line)

ssh.close()
