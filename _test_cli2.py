#!/usr/bin/env python3
"""Deploy cli.py fix + test lumina CLI on all servers."""
import paramiko

SERVERS = [
    ("ttt1", "192.168.56.107"),
    ("ttt2", "192.168.56.106"),
    ("ttt3", "192.168.56.108"),
    ("ttt4", "192.168.56.109"),
]

# Deploy updated cli.py
import os
cli_path = os.path.join(os.path.dirname(__file__), "agents", "common", "cli.py")

for name, ip in SERVERS:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username='root', password='123456')
    sftp = ssh.open_sftp()
    sftp.put(cli_path, "/opt/blossom/lumina/common/cli.py")
    sftp.close()
    print(f"[{name}] cli.py updated")

    cmds = [
        'lumina version',
        'lumina services',
    ]
    for cmd in cmds:
        _, o, e = ssh.exec_command(cmd)
        out = o.read().decode().strip()
        err = e.read().decode().strip()
        if out:
            for line in out.split('\n'):
                print(f"[{name}]   {line}")
        if err:
            print(f"[{name}]   STDERR: {err}")
    print()
    ssh.close()
