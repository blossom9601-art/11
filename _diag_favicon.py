#!/usr/bin/env python3
"""Diagnose favicon issue on remote Lumina server."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)

cmds = [
    # Check all static dirs
    'find /opt/blossom/lumina -name "lumina_ico*" -ls 2>/dev/null',
    # Check nginx static location block
    'grep -A5 "location /static" /etc/nginx/conf.d/lumina.conf',
    # Check what root/alias nginx uses for static
    'grep -B2 -A10 "location /static" /etc/nginx/conf.d/lumina.conf',
    # Check if Flask app has static folder config
    'grep -n "static_folder\\|static_url_path" /opt/blossom/lumina/web/app/__init__.py | head -10',
    # Try curl the favicon directly
    'curl -kso /dev/null -w "%{http_code}" https://127.0.0.1:9601/static/image/logo/lumina_ico.png',
    # Check gunicorn config
    'cat /opt/blossom/lumina/web/gunicorn.conf.py',
    # Check Flask app static folder
    'python3 -c "import sys; sys.path.insert(0,\\\"/opt/blossom/lumina\\\"); from web.app import create_app; a=create_app(); print(\\\"static_folder:\\\", a.static_folder); print(\\\"static_url:\\\", a.static_url_path)"',
]

for cmd in cmds:
    print('=' * 60)
    print('CMD:', cmd[:100])
    print('-' * 60)
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out:
        print(out)
    if err:
        print('ERR:', err)
    print()

ssh.close()
