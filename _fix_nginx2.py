#!/usr/bin/env python3
"""Fix NGINX SELinux/permissions and restart."""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # Fix ownership - nginx needs to write
    'chown -R nginx:nginx /var/log/blossom/lumina/web/',
    'chmod 755 /var/log/blossom /var/log/blossom/lumina /var/log/blossom/lumina/web',
    # SELinux: allow nginx to write to custom log dir
    'semanage fcontext -a -t httpd_log_t "/var/log/blossom/lumina/web(/.*)?" 2>/dev/null; restorecon -Rv /var/log/blossom/lumina/web/ 2>&1',
    # Also fix TLS key permissions for nginx
    'chmod 644 /etc/blossom/lumina/tls/server.key',
    # Restart
    'systemctl restart nginx 2>&1',
    'systemctl is-active nginx',
    # Tests
    'curl -sk https://127.0.0.1/health',
    'curl -s http://127.0.0.1/health',
    "curl -s -o /dev/null -w '%{http_code}' http://192.168.56.108/",
]

for cmd in cmds:
    print(f'$ {cmd}')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out: print(f'  {out}')
    if err: print(f'  ERR: {err}')
    print()

time.sleep(2)

# Final login test
_, o, _ = ssh.exec_command(
    'curl -sk -X POST -H "Content-Type: application/json" '
    '-d \'{"emp_no":"admin","password":"admin1234!"}\' '
    'https://127.0.0.1/api/cli/login')
print(f'Login: {o.read().decode().strip()}')

# Old password
_, o, _ = ssh.exec_command(
    'curl -sk -X POST -H "Content-Type: application/json" '
    '-d \'{"emp_no":"admin","password":"Lumina_Admin_2026!"}\' '
    'https://127.0.0.1/api/cli/login')
print(f'Old pw: {o.read().decode().strip()}')

ssh.close()
