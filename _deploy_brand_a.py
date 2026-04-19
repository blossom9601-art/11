#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""브랜드관리 A안 UI 배포"""
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

FILES = [
    ('app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html', '/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'),
    ('static/css/brand_admin.css', '/opt/blossom/web/static/css/brand_admin.css'),
    ('static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js', '/opt/blossom/web/static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js'),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)

sftp = ssh.open_sftp()
uploaded = 0
for local, remote in FILES:
    sftp.put(local, remote)
    print('✓', local)
    uploaded += 1
sftp.close()

ssh.exec_command('systemctl restart blossom-web')
_, out, _ = ssh.exec_command('systemctl is-active blossom-web')
status = out.read().decode().strip()
print('\n서비스 상태:', status)
print('배포 파일:', uploaded)
ssh.close()
