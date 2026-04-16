#!/usr/bin/env python3
"""Copy favicon SVG to nginx-served path on remote server."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'cp /opt/blossom/lumina/web/static/image/svg/lumina/free-icon-letter-L.svg /opt/blossom/lumina/web/app/static/image/svg/lumina/free-icon-letter-L.svg',
    'ls -la /opt/blossom/lumina/web/app/static/image/svg/lumina/free-icon-letter-L.svg',
    'curl -kso /dev/null -w "%{http_code}" https://127.0.0.1:9601/static/image/svg/lumina/free-icon-letter-L.svg',
]

for cmd in cmds:
    print(f'CMD: {cmd[:80]}')
    _, o, e = ssh.exec_command(cmd, timeout=10)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out:
        print(out)
    if err:
        print('ERR:', err)
    print()

ssh.close()
print('DONE')
