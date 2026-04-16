import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmd = '''cd /opt/blossom/web && source venv/bin/activate 2>/dev/null || true && python3 -c "
from app import create_app
app = create_app()
c = app.test_client()
r = c.post('/login', data={'employee_id':'admin','password':'admin'}, follow_redirects=False)
print(r.status_code, r.headers.get('Location',''))
"'''

i, o, e = ssh.exec_command(cmd)
print('OUT:', o.read().decode()[-500:])
print('ERR:', e.read().decode()[-500:])
ssh.close()
