import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check SECRET_KEY env var
_, o, _ = ssh.exec_command('grep -i SECRET_KEY /etc/systemd/system/blossom-web.service /opt/blossom/web/.env 2>/dev/null; echo "---"; systemctl cat blossom-web 2>/dev/null | grep -i secret')
print('SECRET_KEY config:')
print(o.read().decode())

# Check gunicorn workers
_, o, _ = ssh.exec_command('systemctl cat blossom-web 2>/dev/null')
print('Service unit:')
print(o.read().decode())

# Check recent browser DELETE attempts (not from 127.0.0.1)
_, o, _ = ssh.exec_command('journalctl -u blossom-web --no-pager -n 200 2>/dev/null | grep -i "insight.*delete\\|delete.*insight\\|login_for_write\\|CSRF.*items" | grep -v "127.0.0.1" | tail -10')
print('Browser DELETE logs:')
out = o.read().decode()
print(out if out else '(none)')

# Also check all recent 401 responses
_, o, _ = ssh.exec_command('journalctl -u blossom-web --no-pager -n 200 2>/dev/null | grep "401" | tail -10')
print('401 logs:')
print(o.read().decode())

ssh.close()

ssh.close()
