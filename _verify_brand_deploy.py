#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
배포 검증 스크립트
"""

import paramiko

APP_SERVER = '192.168.56.108'
APP_PATH = '/opt/blossom/web'

def verify_deployment():
    """배포 검증"""
    print(f"[VERIFY] Checking deployment on {APP_SERVER}...")
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(APP_SERVER, username='root', password='123456')
    
    # 1. HTML 파일 확인
    cmd_html = f'grep -c "btn-save" {APP_PATH}/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'
    stdin, stdout, stderr = ssh.exec_command(cmd_html)
    btn_save_count = stdout.read().decode('utf-8').strip()
    print(f"[HTML] btn-save buttons count: {btn_save_count}")
    
    # 2. 로그인 배경 버튼 확인
    cmd_login_btn = f'grep -c "btn-save-login-bg" {APP_PATH}/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'
    stdin, stdout, stderr = ssh.exec_command(cmd_login_btn)
    login_btn = stdout.read().decode('utf-8').strip()
    print(f"[HTML] btn-save-login-bg exists: {login_btn}")
    
    # 3. JS 파일 확인
    cmd_js = f'grep -c "btn-save-login-bg" {APP_PATH}/static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js'
    stdin, stdout, stderr = ssh.exec_command(cmd_js)
    js_login_btn = stdout.read().decode('utf-8').strip()
    print(f"[JS] btn-save-login-bg handler exists: {js_login_btn}")
    
    ssh.close()
    print(f"[VERIFY] Verification completed!")

if __name__ == '__main__':
    verify_deployment()
