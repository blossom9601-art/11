"""Fix SECRET_KEY: set a fixed key so Gunicorn workers share session state"""
import paramiko, secrets

HOST = "192.168.56.108"
USER = "root"  
PASS = "123456"

# Generate a stable secret key
FIXED_KEY = secrets.token_hex(32)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# Set SECRET_KEY in systemd service environment
cmds = [
    # Add to systemd service override
    'mkdir -p /etc/systemd/system/blossom-web.service.d',
    f'''cat > /etc/systemd/system/blossom-web.service.d/secret.conf << 'EOF'
[Service]
Environment="SECRET_KEY={FIXED_KEY}"
EOF''',
    'systemctl daemon-reload',
    'systemctl restart blossom-web',
]

for cmd in cmds:
    print(f">>> {cmd[:80]}")
    _, o, e = ssh.exec_command(cmd, timeout=15)
    out = o.read().decode()
    err = e.read().decode()
    if out.strip(): print(out.strip())
    if err.strip(): print(err.strip())

import time
time.sleep(3)

# Verify
_, o, _ = ssh.exec_command("systemctl is-active blossom-web", timeout=10)
print(f"\nService: {o.read().decode().strip()}")

# Test login + heartbeat
_, o, e = ssh.exec_command(f"""/opt/blossom/web/venv/bin/python3 -c "
import requests, urllib3
urllib3.disable_warnings()
s = requests.Session()
s.get('https://127.0.0.1/login', verify=False, timeout=15)
r = s.post('https://127.0.0.1/login', data={{'employee_id':'admin','password':'admin1234!'}}, verify=False, allow_redirects=False, timeout=15)
print('Login:', r.status_code, r.headers.get('Location',''))
# Hit different workers multiple times
for i in range(5):
    h = s.get('https://127.0.0.1/api/session/heartbeat', verify=False, timeout=5, headers={{'X-Requested-With':'XMLHttpRequest'}})
    print(f'Heartbeat {{i+1}}:', h.status_code)
"
""", timeout=30)
print(o.read().decode())
err = e.read().decode()
if err.strip() and 'InsecureRequest' not in err:
    print("ERR:", err[:500])

ssh.close()
print(f"\nSECRET_KEY set: {FIXED_KEY[:16]}...")
