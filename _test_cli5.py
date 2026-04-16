#!/usr/bin/env python3
"""Diagnose WEB API routes."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # Check if agent_api is in the app
    'curl -s http://127.0.0.1/api/cli/login 2>&1',
    'curl -s -X POST -H "Content-Type: application/json" -d \'{"emp_no":"admin","password":"test"}\' http://127.0.0.1/api/cli/login 2>&1',
    # Check wsgi.py and app structure
    'cat /opt/blossom/lumina/web/wsgi.py',
    'ls /opt/blossom/lumina/web/app/routes/ 2>/dev/null || echo "no routes dir"',
    'grep -r "agent_api" /opt/blossom/lumina/web/ 2>/dev/null | head -5',
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
