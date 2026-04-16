#!/usr/bin/env python3
"""Diagnose NGINX failure."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'journalctl -u nginx --no-pager -n 15 2>&1 | tail -15',
    'nginx -t 2>&1',
    'ls -la /var/log/blossom/lumina/web/',
    'ls -la /etc/blossom/lumina/tls/',
    'cat /etc/nginx/conf.d/lumina.conf | head -50',
]

for cmd in cmds:
    print(f'$ {cmd}')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        for line in out.split('\n'):
            print(f'  {line}')
    if err:
        for line in err.split('\n'):
            print(f'  ERR: {line}')
    print()

ssh.close()
