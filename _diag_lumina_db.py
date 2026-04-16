#!/usr/bin/env python3
"""Grant DELETE permission to lumina_web_reader on DB server via ttt3."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)

# Check current grants and try to grant DELETE via mysql on ttt3
cmds = [
    # Check if mysql client is available
    'which mysql 2>/dev/null || echo NO_MYSQL_CLIENT',
    # Try granting via local mysql (DB might be on 107 or local)
    'mysql -u root -e "SHOW GRANTS FOR \'lumina_web_reader\'@\'192.168.56.108\';" lumina 2>&1 || echo GRANT_CHECK_FAILED',
    # Check if MariaDB is running locally on 108
    'systemctl is-active mariadb 2>/dev/null || systemctl is-active mysql 2>/dev/null || echo NO_LOCAL_DB',
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
