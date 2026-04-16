import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Find all .db files and check permissions
cmds = [
    'find /opt/blossom/web/instance -name "*.db" -ls 2>/dev/null',
    'ls -la /opt/blossom/web/instance/',
    'stat /opt/blossom/web/instance/',
    'id lumina-web',
]
for cmd in cmds:
    print(f"=== {cmd} ===")
    _, o, _ = ssh.exec_command(cmd, timeout=10)
    print(o.read().decode())

# Fix permissions
print("=== FIXING PERMISSIONS ===")
fix_cmds = [
    'chown -R lumina-web:lumina-web /opt/blossom/web/instance/',
    'chmod -R u+rw /opt/blossom/web/instance/',
    'chmod 755 /opt/blossom/web/instance/',
    # Also check for other .db locations
    'find /opt/blossom/web -name "*.db" -ls 2>/dev/null',
]
for cmd in fix_cmds:
    print(f">>> {cmd}")
    _, o, e = ssh.exec_command(cmd, timeout=10)
    out = o.read().decode()
    err = e.read().decode()
    if out.strip(): print(out)
    if err.strip(): print(err)

# Restart
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
o.read()
import time
time.sleep(3)

# Verify
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
print(f"Service: {o.read().decode().strip()}")

# Test API
_, o, e = ssh.exec_command("""/opt/blossom/web/venv/bin/python3 -c "
import requests, urllib3
urllib3.disable_warnings()
s = requests.Session()
s.get('https://127.0.0.1/login', verify=False, timeout=15)
s.post('https://127.0.0.1/login', data={'employee_id':'admin','password':'admin1234!'}, verify=False, timeout=15)
r = s.get('https://127.0.0.1/api/hardware/onpremise/assets', verify=False, timeout=10)
print('API status:', r.status_code)
j = r.json()
print('success:', j.get('success'), 'items:', len(j.get('items',[])), 'total:', j.get('total',0))
"
""", timeout=30)
print(o.read().decode())
err = e.read().decode()
if err.strip() and 'InsecureRequest' not in err:
    print("ERR:", err[:500])

ssh.close()
