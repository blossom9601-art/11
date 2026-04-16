#!/usr/bin/env python3
"""Test lumina login from ttt4."""
import paramiko

# First deploy updated cli.py to ttt4
import os
cli_path = os.path.join(os.path.dirname(__file__), "agents", "common", "cli.py")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.109', username='root', password='123456')

sftp = ssh.open_sftp()
sftp.put(cli_path, "/opt/blossom/lumina/common/cli.py")
sftp.close()
print("[ttt4] cli.py updated")

# Check WEB accessibility from ttt4
cmds = [
    'curl -sk https://192.168.56.108/health 2>&1',
    'curl -sk http://192.168.56.108/health 2>&1',
    'lumina login -s http://192.168.56.108 -u admin -p Lumina_Admin_2026!',
]

for cmd in cmds:
    print(f'\n$ {cmd}')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        print(f'  {out}')
    if err:
        print(f'  STDERR: {err}')

ssh.close()
