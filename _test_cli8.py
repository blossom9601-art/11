#!/usr/bin/env python3
"""Check more MariaDB tables."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.107', username='root', password='123456')

cmds = [
    "mysql -u root lumina -e 'DESCRIBE collected_interfaces;'",
    "mysql -u root lumina -e 'DESCRIBE collected_accounts;'",
    "mysql -u root lumina -e 'DESCRIBE collected_packages;'",
    "mysql -u root lumina -e 'DESCRIBE agent_tokens;'",
    "mysql -u root lumina -e 'DESCRIBE audit_log;'",
    "mysql -u root lumina -e 'SELECT COUNT(*) AS cnt FROM collected_interfaces WHERE host_id=4;'",
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
