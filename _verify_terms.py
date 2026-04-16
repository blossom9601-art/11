#!/usr/bin/env python3
"""Verify terms page is accessible without login on production."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

checks = [
    ('terms_no_login', 'curl -sk https://127.0.0.1/terms | grep -E "terms_agree|terms-ok|동의|확인" || echo "NOT FOUND"'),
    ('terms_with_login_check', 'grep -A5 "can_agree" /opt/blossom/web/app/templates/authentication/11-2.basic/terms.html'),
]

for label, cmd in checks:
    _, so, se = ssh.exec_command(cmd, timeout=10)
    out = so.read().decode().strip()
    err = se.read().decode().strip()
    print(f'=== {label} ===')
    print(out or err)
    print()

ssh.close()
print('DONE')
