"""HTTP 응답 디버깅"""
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Login via curl - verbose
_, o, _ = ssh.exec_command(
    'curl -sv -c /tmp/bc.txt -X POST http://localhost:8001/login '
    '-d "emp_no=admin&password=admin" '
    '-H "Content-Type: application/x-www-form-urlencoded" '
    '-o /dev/null 2>&1 | grep -iE "set-cookie|location|< HTTP"',
    timeout=10
)
print('Login:', o.read().decode().strip())

# Search raw response
_, o, _ = ssh.exec_command(
    "curl -s -b /tmp/bc.txt -X POST http://localhost:8001/api/search/unified "
    "-H 'Content-Type: application/json' "
    "-H 'X-Requested-With: XMLHttpRequest' "
    """-d '{"q":"AI","limit":20}' """
    '-w "\\nHTTP:%{http_code}"',
    timeout=15
)
print('\nSearch:', o.read().decode().strip()[:500])

ssh.close()
