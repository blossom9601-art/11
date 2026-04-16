#!/usr/bin/env python3
"""Diagnose Lumina favicon on remote server."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'find /opt/blossom/lumina -name "free-icon-letter-L.svg" 2>/dev/null',
    'grep -n "free-icon-letter" /opt/blossom/lumina/web/app/__init__.py',
    'grep -A5 "location /static" /etc/nginx/conf.d/lumina*.conf 2>/dev/null || echo NO_NGINX_CONF',
    'grep -E "(root|alias)" /etc/nginx/conf.d/lumina*.conf 2>/dev/null || echo NO_ROOT_ALIAS',
    'curl -kso /dev/null -w "%{http_code}" https://127.0.0.1:9601/static/image/svg/lumina/free-icon-letter-L.svg',
    'ls -la /opt/blossom/lumina/web/app/static/image/svg/lumina/ 2>/dev/null || echo NO_APP_SVG_DIR',
    'ls -la /opt/blossom/lumina/web/static/image/svg/lumina/ 2>/dev/null || echo NO_STATIC_SVG_DIR',
]

for cmd in cmds:
    print(f'=== {cmd[:80]} ===')
    _, o, e = ssh.exec_command(cmd, timeout=10)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out:
        print(out)
    if err:
        print('ERR:', err)
    print()

ssh.close()
print('DONE')
