import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check what port blossom-web listens on
_, o, _ = ssh.exec_command('ss -tlnp | grep python')
print("Port:", o.read().decode().strip())

# Check service config
_, o, _ = ssh.exec_command('cat /etc/systemd/system/blossom-web.service 2>/dev/null || systemctl cat blossom-web')
print("\nService config:")
print(o.read().decode().strip()[:500])

# Try localhost with different ports
for port in [5000, 8080, 8000, 9601]:
    _, o, _ = ssh.exec_command(f'curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1:{port}/ 2>/dev/null')
    code = o.read().decode().strip()
    if code and code != '000':
        print(f"\nPort {port}: HTTP {code}")

# Full curl with redirect follow
_, o, _ = ssh.exec_command('curl -s -L -o /dev/null -w "code=%{http_code} url=%{url_effective}" http://127.0.0.1:8080/p/cat_server 2>/dev/null')
print("\nFull test:", o.read().decode().strip())

# Test with proper login
_, o, _ = ssh.exec_command('''
curl -s -c /tmp/blossom_cookie -L \
  -d "username=admin&password=admin" \
  http://127.0.0.1:8080/login 2>/dev/null | head -3
''')
login_out = o.read().decode().strip()
print(f"\nLogin attempt: {login_out[:200]}")

# SPA request with cookie
_, o, _ = ssh.exec_command('''
curl -s -b /tmp/blossom_cookie \
  -H "X-Requested-With: blossom-spa" \
  http://127.0.0.1:8080/p/cat_server 2>/dev/null | head -20
''')
spa_out = o.read().decode().strip()
print(f"\nSPA response: {spa_out[:500]}")

ssh.close()
print("\nDONE")
