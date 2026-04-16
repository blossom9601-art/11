#!/usr/bin/env python3
"""Grant DELETE perms via SSH to 107 DB server directly."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

# Try SSH into 107 directly
try:
    ssh.connect('192.168.56.107', port=22, username='root', password='123456', timeout=10)
    print('SSH to 107: OK')
except Exception as e:
    print('SSH to 107 FAILED:', e)
    print('Trying via jump host 108...')
    # SSH into 108 first, then SSH to 107
    ssh108 = paramiko.SSHClient()
    ssh108.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh108.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)
    
    # Try SSH from 108 to 107
    _, o, e_out = ssh108.exec_command('ssh -o StrictHostKeyChecking=no root@192.168.56.107 "mysql -e \\"SHOW GRANTS FOR \'lumina_web_reader\'@\'192.168.56.108\';\\""')
    print(o.read().decode('utf-8', 'replace'))
    print(e_out.read().decode('utf-8', 'replace'))
    ssh108.close()
    exit()

# We're on 107 now - run mysql commands
cmds = [
    'mysql -e "SHOW GRANTS FOR \'lumina_web_reader\'@\'192.168.56.108\';" 2>&1',
    'mysql -e "GRANT SELECT, INSERT, UPDATE, DELETE ON lumina.* TO \'lumina_web_reader\'@\'192.168.56.108\'; FLUSH PRIVILEGES;" 2>&1',
    'mysql -e "SHOW GRANTS FOR \'lumina_web_reader\'@\'192.168.56.108\';" 2>&1',
]

for cmd in cmds:
    print('CMD:', cmd[:80])
    _, o, e_out = ssh.exec_command(cmd)
    print(o.read().decode('utf-8', 'replace').strip())
    err = e_out.read().decode('utf-8', 'replace').strip()
    if err:
        print('ERR:', err)
    print()

ssh.close()
print('DONE')
