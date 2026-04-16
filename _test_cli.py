#!/usr/bin/env python3
"""Test lumina CLI on remote servers."""
import paramiko

def test_server(ip, label):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username='root', password='123456')
    cmds = [
        'ls -la /opt/blossom/lumina/common/cli.py',
        'lumina version',
        'lumina services',
    ]
    for cmd in cmds:
        print(f'[{label}] $ {cmd}')
        _, o, e = ssh.exec_command(cmd)
        out = o.read().decode().strip()
        err = e.read().decode().strip()
        if out:
            print(f'[{label}]   {out}')
        if err:
            print(f'[{label}]   STDERR: {err}')
    ssh.close()

for name, ip in [('ttt3', '192.168.56.108'), ('ttt4', '192.168.56.109')]:
    print(f'\n=== {name} ({ip}) ===')
    test_server(ip, name)
