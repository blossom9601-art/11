import paramiko, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # login with form data
    'curl -sk -c /tmp/ck.txt -b /tmp/ck.txt '
    '-X POST https://localhost/login '
    '-d "employee_id=admin&password=admin" '
    '-L -o /dev/null -w "%{http_code}"',
    # list trend
    'curl -sk -b /tmp/ck.txt '
    '"https://localhost/api/insight/items?category=trend&page=1&page_size=10"',
    # delete id=1 with XHR header
    'curl -sk -b /tmp/ck.txt '
    '-X DELETE '
    '-H "X-Requested-With: XMLHttpRequest" '
    '-H "Accept: application/json" '
    '"https://localhost/api/insight/items/1"',
    # verify after delete
    'curl -sk -b /tmp/ck.txt '
    '"https://localhost/api/insight/items?category=trend&page=1&page_size=10"',
]

for cmd in cmds:
    print(f'\n>>> {cmd[:90]}...')
    _, o, _ = ssh.exec_command(cmd)
    out = o.read().decode()
    print(out[:500])

ssh.close()
