import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# auth.py에 file-management 라우트 확인
cmd = "grep -n 'file_management\\|file-management' /opt/blossom/web/app/routes/auth.py"
_, o, _ = ssh.exec_command(cmd)
result = o.read().decode()
print("=== auth.py file-management 라우트 ===")
print(result if result.strip() else "(없음)")

# auth.py 줄 수
_, o, _ = ssh.exec_command('wc -l /opt/blossom/web/app/routes/auth.py')
print(f"auth.py 줄 수: {o.read().decode().strip()}")

# api.py file-management 관련
cmd2 = "grep -n 'file_management\\|file-management\\|file.manag' /opt/blossom/web/app/routes/api.py | head -20"
_, o, _ = ssh.exec_command(cmd2)
result2 = o.read().decode()
print("\n=== api.py file-management 관련 ===")
print(result2 if result2.strip() else "(없음)")

# pages.py에 file_management 확인
cmd3 = "grep -n 'file_management' /opt/blossom/web/app/routes/pages.py"
_, o, _ = ssh.exec_command(cmd3)
result3 = o.read().decode()
print("\n=== pages.py file_management ===")
print(result3 if result3.strip() else "(없음)")

# __init__.py에 file_management 확인
cmd4 = "grep -n 'file_management' /opt/blossom/web/app/__init__.py"
_, o, _ = ssh.exec_command(cmd4)
result4 = o.read().decode()
print("\n=== __init__.py file_management ===")
print(result4 if result4.strip() else "(없음)")

# brand-settings 기본값복원 관련
cmd5 = "grep -n '기본값' /opt/blossom/web/static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js"
_, o, _ = ssh.exec_command(cmd5)
result5 = o.read().decode()
print("\n=== brand.js '기본값' 검색 ===")
print(result5 if result5.strip() else "(없음 - 기본값복원 버튼 제거됨)")

# curl 테스트
import time
time.sleep(2)
cmd6 = 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/admin/auth/file-management'
_, o, _ = ssh.exec_command(cmd6)
print(f"\nBlossom file-management page: {o.read().decode().strip()}")

cmd7 = 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/admin/auth/brand'
_, o, _ = ssh.exec_command(cmd7)
print(f"Blossom brand page: {o.read().decode().strip()}")

ssh.close()
print("\n검증 완료.")
