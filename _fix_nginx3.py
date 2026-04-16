#!/usr/bin/env python3
"""Fix NGINX SELinux contexts and restart."""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # Fix SELinux context for log files
    'chcon -R -t httpd_log_t /var/log/blossom/lumina/web/',
    # Fix SELinux context for TLS certs
    'chcon -t cert_t /etc/blossom/lumina/tls/server.crt /etc/blossom/lumina/tls/server.key /etc/blossom/lumina/tls/ca.crt',
    # Make persistent
    'semanage fcontext -a -t httpd_log_t "/var/log/blossom/lumina/web(/.*)?" 2>&1 || true',
    'semanage fcontext -a -t cert_t "/etc/blossom/lumina/tls(/.*)?" 2>&1 || true',
    # Verify contexts
    'ls -laZ /var/log/blossom/lumina/web/',
    # Restart
    'systemctl restart nginx 2>&1',
    'systemctl is-active nginx',
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

# Verify HTTPS
tests = [
    'curl -sk https://127.0.0.1/health',
    'curl -s http://127.0.0.1/health',
    'curl -sk -X POST -H "Content-Type: application/json" '
    '-d \'{"emp_no":"admin","password":"admin1234!"}\' https://127.0.0.1/api/cli/login',
]
for cmd in tests:
    print(f'$ {cmd}')
    _, o, _ = ssh.exec_command(cmd)
    print(f'  {o.read().decode().strip()}')
    print()

ssh.close()
