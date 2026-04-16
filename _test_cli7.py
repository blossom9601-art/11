#!/usr/bin/env python3
"""Check MariaDB schema on ttt1."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.107', username='root', password='123456')

cmds = [
    "mysql -u root lumina -e 'SHOW TABLES;'",
    "mysql -u root lumina -e 'DESCRIBE collected_hosts;'",
    "mysql -u root lumina -e 'SELECT * FROM collected_hosts LIMIT 3;'",
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
