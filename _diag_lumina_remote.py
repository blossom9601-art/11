#!/usr/bin/env python3
"""Diagnose Lumina remote deployment state."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)

cmds = [
    'ls -la /opt/blossom/lumina/web/static/image/logo/ 2>/dev/null || echo NO_STATIC_DIR',
    'grep -n "favicon\\|lumina_ico\\|static_folder\\|static_url" /opt/blossom/lumina/web/app/__init__.py | head -20',
    'grep -n "btn-delete\\|btn-remove\\|REMOVE\\|/delete" /opt/blossom/lumina/web/app/__init__.py | head -20',
    'ls /opt/blossom/lumina/web/',
    'ls /opt/blossom/lumina/web/app/',
    'head -10 /opt/blossom/lumina/web/wsgi.py',
    'grep -n "static" /opt/blossom/lumina/web/wsgi.py 2>/dev/null || echo NO_STATIC_IN_WSGI',
    'grep -n "static" /opt/blossom/lumina/web/gunicorn.conf.py 2>/dev/null || echo NO_STATIC_IN_GUNICORN',
    'cat /etc/nginx/conf.d/lumina.conf 2>/dev/null || cat /etc/nginx/conf.d/lumina*.conf 2>/dev/null || echo NO_NGINX_CONF',
]

for cmd in cmds:
    print('=' * 60)
    print('CMD:', cmd[:80])
    print('-' * 60)
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode('utf-8', 'replace')
    err = e.read().decode('utf-8', 'replace').strip()
    if out.strip():
        print(out)
    if err:
        print('ERR:', err)
    print()

ssh.close()
print('DONE')
