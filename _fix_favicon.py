#!/usr/bin/env python3
"""Fix favicon: copy to correct nginx static path."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)

cmds = [
    # Create target dir if missing
    'mkdir -p /opt/blossom/lumina/web/app/static/image/svg/lumina/',
    # Copy favicon to nginx-served path
    'cp /opt/blossom/lumina/web/static/image/svg/lumina/free-icon-letter-L.svg /opt/blossom/lumina/web/app/static/image/svg/lumina/free-icon-letter-L.svg',
    # Also copy logos if missing
    'cp -n /opt/blossom/lumina/web/static/image/logo/lumina_black.png /opt/blossom/lumina/web/app/static/image/logo/ 2>/dev/null; echo ok',
    'cp -n /opt/blossom/lumina/web/static/image/logo/lumina_white.png /opt/blossom/lumina/web/app/static/image/logo/ 2>/dev/null; echo ok',
    # Verify
    'ls -la /opt/blossom/lumina/web/app/static/image/svg/lumina/',
    # Test favicon via curl
    'curl -kso /dev/null -w "%{http_code}" https://127.0.0.1:9601/static/image/svg/lumina/free-icon-letter-L.svg',
]

for cmd in cmds:
    print('CMD:', cmd[:90])
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out:
        print(out)
    if err:
        print('ERR:', err)
    print()

ssh.close()
print('DONE')
