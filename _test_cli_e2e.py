#!/usr/bin/env python3
"""Full E2E test: lumina CLI from ttt4 → ttt3 WEB API."""
import os
import paramiko

# Deploy latest cli.py to ttt4
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.109', username='root', password='123456')
sftp = ssh.open_sftp()
sftp.put(os.path.join(os.path.dirname(__file__), "agents", "common", "cli.py"),
         "/opt/blossom/lumina/common/cli.py")
sftp.close()
print("[ttt4] cli.py updated")

cmds = [
    'lumina login -s http://192.168.56.108 -u admin -p Lumina_Admin_2026!',
    'lumina agents',
    'lumina search --hostname ttt4',
    'lumina agent 4 show',
    'lumina agent 4 status',
    'lumina agent 4 health',
    'lumina services',
    'lumina version',
]

for cmd in cmds:
    print(f'\n$ {cmd}')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        for line in out.split('\n'):
            print(f'  {line}')
    if err:
        for line in err.split('\n'):
            print(f'  ERR: {line}')

ssh.close()
