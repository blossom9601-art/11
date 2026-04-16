#!/usr/bin/env python3
"""Test lumina login + agents commands from ttt4 → ttt3 WEB API."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.109', username='root', password='123456')

cmds = [
    # Set server to WEB (ttt3)
    'lumina login --server https://192.168.56.108 --user admin --password Lumina_Admin_2026!',
    'lumina agents',
    'lumina search ttt4',
]

for cmd in cmds:
    print(f'$ {cmd}')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        print(f'  {out}')
    if err:
        print(f'  STDERR: {err}')
    print()

ssh.close()
