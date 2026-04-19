"""Deploy pages.py with project menu code fix."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

sftp = ssh.open_sftp()
sftp.put(r'c:\Users\ME\Desktop\blossom\app\routes\pages.py',
         '/opt/blossom/web/app/routes/pages.py')
sftp.close()

i, o, e = ssh.exec_command('systemctl restart blossom-web')
print('restart:', o.read().decode(), e.read().decode())

# Verify search on production
import time; time.sleep(3)

verify = '''
import sys, os, json
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
os.environ['FLASK_APP'] = 'run.py'
from app import create_app
app = create_app()
with app.test_client() as c:
    with c.session_transaction() as s:
        s['user_id'] = 1; s['emp_no'] = 'E001'; s['role'] = 'admin'
        s['_login_at'] = '2025-01-01T00:00:00'; s['_last_active'] = '2099-01-01T00:00:00'
    queries = ['프로젝트', '서버', 'VPN', '보안', '작업', '워크플로우', '티켓', '네트워크', 'DNS', '블로그']
    for q in queries:
        r = c.post('/api/search/unified', json={'q': q, 'limit': 20})
        d = r.get_json()
        titles = [x.get('title','') for x in d.get('rows',[])]
        print(f"  {q}: total={d.get('total',0)} titles={titles[:5]}")
'''

with sftp_new := ssh.open_sftp() as sf:
    pass

sftp2 = ssh.open_sftp()
with sftp2.file('/opt/blossom/web/_verify_prod.py', 'w') as f:
    f.write(verify)
sftp2.close()

i, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python /opt/blossom/web/_verify_prod.py')
print(o.read().decode())
err = e.read().decode()
if err:
    # filter out warnings
    for line in err.split('\n'):
        if 'Error' in line or 'Traceback' in line or 'raise' in line:
            print('ERR:', line)
ssh.close()
'''
