import paramiko, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# verbose login to see redirect and cookies
cmd = (
    'curl -sk -c /tmp/ck2.txt -b /tmp/ck2.txt '
    '-X POST https://localhost/login '
    '-d "employee_id=admin&password=admin" '
    '-v -o /dev/null 2>&1 | head -40'
)
print('>>> LOGIN')
_, o, _ = ssh.exec_command(cmd)
print(o.read().decode())

# show cookie file
print('>>> COOKIES')
_, o, _ = ssh.exec_command('cat /tmp/ck2.txt')
print(o.read().decode())

# test session with a simple GET that checks session
print('>>> SESSION TEST (list)')
_, o, _ = ssh.exec_command(
    'curl -sk -b /tmp/ck2.txt '
    '-H "X-Requested-With: XMLHttpRequest" '
    '"https://localhost/api/insight/items?category=trend&page=1&page_size=10"'
)
print(o.read().decode()[:300])

# now try DELETE
print('>>> DELETE id=1')
_, o, _ = ssh.exec_command(
    'curl -sk -b /tmp/ck2.txt '
    '-X DELETE '
    '-H "X-Requested-With: XMLHttpRequest" '
    '-v '
    '"https://localhost/api/insight/items/1" 2>&1'
)
print(o.read().decode()[:500])

ssh.close()
