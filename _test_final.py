#!/usr/bin/env python3
"""E2E test: HTTPS + new password + CLI from ttt4."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.109', username='root', password='123456')

cmds = [
    # 1. HTTPS accessible from ttt4
    'curl -sk https://192.168.56.108/health',
    # 2. HTTP redirects to HTTPS
    "curl -sk -o /dev/null -w '%{http_code}' http://192.168.56.108/ 2>&1",
    # 3. Login with NEW password via HTTPS
    'lumina login -s https://192.168.56.108 -u admin -p admin1234!',
    # 4. OLD password fails
    'lumina login -s https://192.168.56.108 -u admin -p Lumina_Admin_2026! 2>&1 || true',
    # 5. Agent list
    'lumina agents',
    # 6. Agent detail
    'lumina agent 4 health',
    # 7. Version
    'lumina version',
]

for cmd in cmds:
    print(f'$ {cmd}')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        for line in out.split('\n'):
            print(f'  {line}')
    if err:
        for line in err.split('\n'):
            print(f'  ERR: {line}')
    print()

ssh.close()
