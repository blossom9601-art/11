#!/usr/bin/env python3
"""Diagnose lumina_web_reader user in MariaDB on 107."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.107', port=22, username='root', password='123456', timeout=10)

cmds = [
    # Find all lumina users
    "mysql -e \"SELECT user, host FROM mysql.user WHERE user LIKE 'lumina%';\"",
    # Find all users with any grants on lumina DB
    "mysql -e \"SELECT * FROM mysql.db WHERE Db='lumina';\"",
    # Check the actual host pattern used
    "mysql -e \"SELECT user, host FROM mysql.user WHERE user LIKE '%web%' OR user LIKE '%lumina%';\"",
    # Show all users
    "mysql -e \"SELECT user, host FROM mysql.user;\"",
]

for cmd in cmds:
    print('CMD:', cmd[:80])
    _, o, e = ssh.exec_command(cmd)
    print(o.read().decode('utf-8', 'replace').strip())
    err = e.read().decode('utf-8', 'replace').strip()
    if err:
        print('ERR:', err)
    print()

ssh.close()
