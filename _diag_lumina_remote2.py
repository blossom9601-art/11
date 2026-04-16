#!/usr/bin/env python3
"""Check remote Lumina details."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)

cmds = [
    'grep -n "location /static" /etc/nginx/conf.d/lumina.conf',
    'grep -n "btn-delete\\|/action\\|delete" /opt/blossom/lumina/web/app/__init__.py | head -20',
    'wc -l /opt/blossom/lumina/web/app/__init__.py',
    'ls -la /opt/blossom/lumina/web/static/image/logo/',
]
for cmd in cmds:
    print('CMD:', cmd[:80])
    _, o, e = ssh.exec_command(cmd)
    print(o.read().decode('utf-8', 'replace').strip())
    err = e.read().decode('utf-8', 'replace').strip()
    if err:
        print('ERR:', err)
    print()
ssh.close()
print('DONE')
