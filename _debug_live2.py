"""Live service detailed debug"""
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Login - capture all headers and cookies
_, o, _ = ssh.exec_command(
    'curl -sv -c /tmp/bc2.txt -X POST http://localhost:8001/login '
    '-d "employee_id=admin&password=admin" '
    '-H "Content-Type: application/x-www-form-urlencoded" '
    '2>&1',
    timeout=10
)
out = o.read().decode()
for line in out.split('\n'):
    if 'Set-Cookie' in line or '< HTTP' in line or 'Location' in line:
        print(line.strip())

# Show cookie file
_, o, _ = ssh.exec_command('cat /tmp/bc2.txt')
print('\nCookie file:')
print(o.read().decode().strip())

# Try search with cookie
_, o, _ = ssh.exec_command(
    "curl -s -b /tmp/bc2.txt http://localhost:8001/api/search/unified "
    "-X POST -H 'Content-Type: application/json' "
    "-H 'X-Requested-With: XMLHttpRequest' "
    """-d '{"q":"AI","limit":20}' """
    '-w "\\n---HTTP:%{http_code}"',
    timeout=10
)
resp = o.read().decode().strip()
print('\nSearch response:', resp[:500])

ssh.close()
