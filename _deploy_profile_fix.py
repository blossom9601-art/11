import paramiko, pathlib, time

host = '192.168.56.108'
user = 'root'
pw = '123456'

files = [
    ('app/models.py', '/opt/blossom/web/app/models.py'),
    ('app/__init__.py', '/opt/blossom/web/app/__init__.py'),
    ('app/routes/api.py', '/opt/blossom/web/app/routes/api.py'),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)
sftp = ssh.open_sftp()

for local, remote in files:
    sftp.put(str(pathlib.Path(local).resolve()), remote)
    print(f'uploaded {local} -> {remote}')

sftp.close()

def run(cmd, timeout=20):
    _, so, se = ssh.exec_command(cmd, timeout=timeout)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    return out + ('\n[STDERR]' + err if err else '')

print('\n--- Restarting blossom-web ---')
print(run('systemctl restart blossom-web', timeout=30))
time.sleep(3)

print(run('systemctl is-active blossom-web'))

print('\n--- Journalctl: check location migration ---')
print(run('journalctl -u blossom-web --no-pager -n 20 | grep -E "org-user|location|error|Error" | head -20'))

print('\n--- Verify location column in DB ---')
print(run("sqlite3 /opt/blossom/web/instance/dev_blossom.db 'PRAGMA table_info(org_user)' | grep -i location"))

print('\n--- Quick API test (venv python) ---')
test = '''
import sys, json, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
from app import create_app
from app.models import AuthUser
from datetime import datetime
app = create_app()
with app.app_context():
    admin = AuthUser.query.filter_by(role='ADMIN').first() or AuthUser.query.first()
    emp = admin.emp_no if admin else 'admin'
with app.test_client() as c:
    with c.session_transaction() as sess:
        sess['user_id'] = admin.id
        sess['emp_no'] = emp
        sess['role'] = 'ADMIN'
        sess['_login_at'] = datetime.utcnow().isoformat()
        sess['_last_active'] = datetime.utcnow().isoformat()
    r = c.post('/api/me/profile', data=json.dumps({'profile_image': '/static/image/svg/profil/002-girl.svg'}), content_type='application/json')
    print('POST status:', r.status_code)
    print('POST body:', r.data.decode('utf-8')[:300])
    r2 = c.get('/api/me/profile')
    print('GET status:', r2.status_code)
    print('GET body:', r2.data.decode('utf-8')[:300])
'''
with ssh.open_sftp() as sftp2:
    with sftp2.file('/tmp/test_profile2.py', 'w') as f:
        f.write(test)
print(run('/opt/blossom/web/venv/bin/python3 /tmp/test_profile2.py 2>&1', timeout=30))

ssh.close()
print('\nDone.')
