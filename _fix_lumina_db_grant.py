#!/usr/bin/env python3
"""Grant DELETE/UPDATE to lumina_web_reader@'%' on 107."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.107', port=22, username='root', password='123456', timeout=10)

cmds = [
    "mysql -e \"GRANT SELECT, INSERT, UPDATE, DELETE ON lumina.* TO 'lumina_web_reader'@'%'; FLUSH PRIVILEGES;\"",
    "mysql -e \"SHOW GRANTS FOR 'lumina_web_reader'@'%';\"",
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
print('DONE')
