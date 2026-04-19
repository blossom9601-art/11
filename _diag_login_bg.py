#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""로그인 배경 이미지 업로드 문제 진단"""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

# 1. API 엔드포인트 확인
print("=== 1. /upload 엔드포인트 확인 ===")
_, o, _ = ssh.exec_command("grep -n '@bp.route.*upload' /opt/blossom/web/app/routes/api.py | head -5")
result = o.read().decode().strip()
print(result if result else "(없음)")

# 2. /brand-settings 엔드포인트 확인  
print("\n=== 2. /brand-settings 엔드포인트 확인 ===")
_, o, _ = ssh.exec_command("grep -n 'def.*brand.*setting' /opt/blossom/web/app/routes/api.py | head -5")
result = o.read().decode().strip()
print(result if result else "(없음)")

# 3. 최근 에러 로그
print("\n=== 3. 최근 에러 로그 ===")
_, o, _ = ssh.exec_command("journalctl -u blossom-web -n 50 --no-pager 2>/dev/null | grep -i error | tail -10")
result = o.read().decode().strip()
print(result if result else "(없음)")

# 4. 최근 upload 관련 로그
print("\n=== 4. 최근 요청 로그 ===")
_, o, _ = ssh.exec_command("journalctl -u blossom-web -n 100 --no-pager 2>/dev/null | grep -E 'POST|upload|brand' | tail -15")
result = o.read().decode().strip()
print(result if result else "(없음)")

ssh.close()
