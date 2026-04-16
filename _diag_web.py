#!/usr/bin/env python3
"""Lumina WEB 디버깅."""
import paramiko, json, sys, time

sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

# 1. Gunicorn 에러 로그
print("=== Gunicorn 로그 (최근 20줄) ===")
stdin, stdout, stderr = c.exec_command("journalctl -u lumina-web --no-pager -n 20 2>&1")
print(stdout.read().decode("utf-8", errors="replace"))

# 2. 실제 __init__.py 내용 확인 (create_app 부분)
print("\n=== __init__.py 확인 (첫 30줄 + create_app) ===")
stdin, stdout, stderr = c.exec_command("head -40 /opt/blossom/lumina/web/app/__init__.py")
print(stdout.read().decode("utf-8", errors="replace"))

# 3. 직접 API 호출 테스트
print("\n=== 직접 API 테스트 ===")

# 로그인
stdin, stdout, stderr = c.exec_command(
    'curl -sk -X POST https://127.0.0.1/api/cli/login '
    '-H "Content-Type: application/json" '
    '-d \'{"emp_no":"admin","password":"admin1234!"}\' 2>&1'
)
login_resp = stdout.read().decode()
print("Login:", login_resp)

try:
    token = json.loads(login_resp).get("token", "")
except:
    token = ""
    print("Token extraction failed")

if token:
    # agents 호출
    stdin, stdout, stderr = c.exec_command(
        'curl -sk -v https://127.0.0.1/api/cli/agents '
        '-H "Authorization: Bearer %s" 2>&1' % token
    )
    print("Agents:", stdout.read().decode("utf-8", errors="replace"))

# 4. 대시보드 페이지 렌더링 (세션 쿠키 획득 -> / 접근)
print("\n=== 대시보드 렌더링 테스트 ===")
stdin, stdout, stderr = c.exec_command(
    'curl -sk -c /tmp/lumina_cookies -X POST https://127.0.0.1/login '
    '-d "emp_no=admin&password=admin1234!" -L 2>&1 | head -50'
)
html = stdout.read().decode("utf-8", errors="replace")
# TOKEN 변수가 제대로 렌더링되는지 확인
if "TOKEN" in html:
    # TOKEN 값 추출
    import re
    m = re.search(r"var TOKEN = '([^']*)'", html)
    if m:
        print("TOKEN rendered:", m.group(1)[:30] + "...")
    else:
        print("TOKEN not found in HTML")
        # 주변 컨텍스트 출력
        idx = html.find("TOKEN")
        if idx != -1:
            print("Context:", html[max(0,idx-30):idx+100])
else:
    print("No TOKEN in response")
    print("Response preview:", html[:500])

# 5. 에러 로그 (최근)
print("\n=== 최근 에러 ===")
stdin, stdout, stderr = c.exec_command("journalctl -u lumina-web --no-pager -n 10 --since='2 min ago' 2>&1")
print(stdout.read().decode("utf-8", errors="replace"))

c.close()
