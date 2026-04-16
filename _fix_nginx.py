#!/usr/bin/env python3
"""Fix NGINX on ttt3: log perms + OCSP stapling + restart."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # Fix log dir permissions
    'mkdir -p /var/log/blossom/lumina/web && chmod 755 /var/log/blossom/lumina/web && chown root:root /var/log/blossom/lumina/web',
    # Disable OCSP stapling (self-signed cert)
    "sed -i 's/ssl_stapling on;/ssl_stapling off;/' /etc/nginx/conf.d/lumina.conf",
    "sed -i 's/ssl_stapling_verify on;/ssl_stapling_verify off;/' /etc/nginx/conf.d/lumina.conf",
    # Remove rpmnew leftover
    'rm -f /etc/nginx/conf.d/lumina.conf.rpmnew',
    # Test and restart
    'nginx -t 2>&1',
    'systemctl restart nginx 2>&1',
    'systemctl is-active nginx',
    # Test HTTPS
    'curl -sk https://127.0.0.1/health 2>&1',
    # Test HTTP /health (local)
    'curl -s http://127.0.0.1/health 2>&1',
    # Test HTTP redirect (non-health)
    "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ 2>&1",
    # Test login with new password
    'curl -sk -X POST -H "Content-Type: application/json" '
    '-d \'{"emp_no":"admin","password":"admin1234!"}\' '
    'https://127.0.0.1/api/cli/login 2>&1',
    # Old password should fail
    'curl -sk -X POST -H "Content-Type: application/json" '
    '-d \'{"emp_no":"admin","password":"Lumina_Admin_2026!"}\' '
    'https://127.0.0.1/api/cli/login 2>&1',
]

for cmd in cmds:
    print(f'$ {cmd}')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        print(f'  {out}')
    if err:
        print(f'  ERR: {err}')
    print()

ssh.close()
