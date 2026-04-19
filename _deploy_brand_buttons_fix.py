#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
배포 스크립트: 브랜드 설정 페이지 버튼 통일 및 로그인 배경 이미지 저장 기능 추가
- "헤더 설정 저장" → "저장" + SVG 아이콘
- "카드 로고 저장" → "저장" + SVG 아이콘
- 로그인 배경 이미지 "저장" 버튼 추가 + SVG 아이콘
- 로그인 배경 이미지 저장 기능 구현
"""

import paramiko
import sys
import os
from pathlib import Path

# 배포 설정
APP_SERVER = '192.168.56.108'
APP_PATH = '/opt/blossom/web'
FILES_TO_DEPLOY = [
    ('app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html', 
     'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'),
    ('static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js',
     'static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js'),
]

def deploy_files():
    """파일 배포"""
    print(f"[DEPLOY] Starting deployment to {APP_SERVER}...")
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(APP_SERVER, username='root', password='123456')
    sftp = ssh.open_sftp()
    
    try:
        for local_file, remote_file in FILES_TO_DEPLOY:
            local_path = Path(local_file)
            remote_path = f'{APP_PATH}/{remote_file}'
            
            if not local_path.exists():
                print(f"[ERROR] Local file not found: {local_file}")
                continue
            
            print(f"[DEPLOY] Copying {local_file}...")
            sftp.put(str(local_path), remote_path)
            print(f"[OK] {remote_file}")
    finally:
        sftp.close()
    
    # 서비스 재시작
    print(f"[DEPLOY] Restarting services...")
    cmd_restart = (
        'systemctl stop blossom-web nginx 2>/dev/null; '
        'sleep 2; '
        'systemctl start blossom-web nginx; '
        'sleep 2; '
        'echo "Services restarted"'
    )
    stdin, stdout, stderr = ssh.exec_command(cmd_restart)
    output = stdout.read().decode('utf-8')
    print(f"[RESTART] {output.strip()}")
    
    ssh.close()
    print(f"[DEPLOY] Deployment completed successfully!")

if __name__ == '__main__':
    try:
        deploy_files()
    except Exception as e:
        print(f"[ERROR] Deployment failed: {e}")
        sys.exit(1)
