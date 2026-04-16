#!/usr/bin/env python3
"""Check Lumina WEB app structure on ttt3."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'find /opt/blossom/lumina/web -name "*.py" | sort',
    'cat /opt/blossom/lumina/web/app/__init__.py',
]

for cmd in cmds:
    print(f'$ {cmd}')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    if out:
        for line in out.split('\n'):
            print(f'  {line}')
    print()

ssh.close()
