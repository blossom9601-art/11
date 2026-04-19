#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""로그인 배경 이미지 CSRF 수정 배포"""
import paramiko
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=30)
sftp = ssh.open_sftp()

files = [
    ('app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html', '/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'),
    ('static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js', '/opt/blossom/web/static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js'),
]

count = 0
for local, remote in files:
    try:
        sftp.put(local, remote)
        print(f"✓ {local}")
        count += 1
    except Exception as e:
        print(f"✗ {local}: {e}")

sftp.close()

# 서비스 재시작
_, o, _ = ssh.exec_command('systemctl restart blossom-web')
err = o.read().decode().strip()
if err:
    print(f"재시작 오류: {err}")
else:
    print("\n✓ blossom-web 서비스 재시작 완료")

# 상태 확인
import time
time.sleep(2)
_, o, _ = ssh.exec_command('systemctl is-active blossom-web')
status = o.read().decode().strip()
print(f"상태: {status}")

ssh.close()
print(f"\n배포 완료: {count}/2 파일")
