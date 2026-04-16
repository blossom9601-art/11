import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Re-test API right now
test_script = r"""
import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
os.environ['FLASK_APP'] = 'run:create_app()'

from app import create_app
app = create_app()

with app.test_client() as c:
    # Login
    c.post('/api/auth/login', json={'employee_id':'admin','password':'admin1234!'})
    
    # Test the failing endpoint
    r = c.get('/api/hardware/onpremise/assets')
    print(f'Status: {r.status_code}')
    data = r.get_json()
    if data:
        print(f'Success: {data.get("success")}')
        print(f'Total: {data.get("total")}')
        err = data.get('error')
        if err:
            print(f'Error: {err}')
    else:
        print(f'Body: {r.data[:500]}')
"""

_, o, e = ssh.exec_command(f'/opt/blossom/web/venv/bin/python3 -c {repr(test_script)}', timeout=15)
print("=== API test ===")
print(o.read().decode())
err = e.read().decode()
if err.strip():
    # Filter out just relevant errors
    for line in err.split('\n'):
        if 'Error' in line or 'error' in line or 'Traceback' in line or 'readonly' in line or line.strip().startswith('File'):
            print(line)

# 2. Check recent journal errors (last 30 seconds)
_, o, _ = ssh.exec_command('journalctl -u blossom-web --since "30 seconds ago" --no-pager 2>/dev/null', timeout=5)
j = o.read().decode()
if j.strip():
    print("\n=== Recent journal ===")
    print(j[-2000:])

ssh.close()
