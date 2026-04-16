#!/usr/bin/env python3
"""Lumina WEB — 브라우저 시뮬레이션 디버깅."""
import paramiko, json, sys, re

sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

# 1. 쿠키 기반 로그인 + 대시보드 접근
print("=== Step 1: 세션 쿠키 획득 (로그인 폼 POST) ===")
stdin, stdout, stderr = c.exec_command(
    'curl -sk -c /tmp/lc.txt -b /tmp/lc.txt '
    '-X POST https://127.0.0.1/login '
    '-d "emp_no=admin&password=admin1234!" '
    '-D /tmp/lh.txt '
    '-o /dev/null -w "HTTP %{http_code} redirect=%{redirect_url}" 2>&1'
)
print("Login:", stdout.read().decode())

# 응답 헤더 확인
stdin, stdout, stderr = c.exec_command("cat /tmp/lh.txt")
headers = stdout.read().decode()
print("Headers:", headers[:500])

# 2. 리다이렉트 대상(/) 접근
print("\n=== Step 2: 대시보드 접근 (쿠키 사용) ===")
stdin, stdout, stderr = c.exec_command(
    'curl -sk -b /tmp/lc.txt https://127.0.0.1/ -o /tmp/dashboard.html -w "HTTP %{http_code}" 2>&1'
)
print("Dashboard:", stdout.read().decode())

# 3. 렌더링 HTML에서 TOKEN 확인
stdin, stdout, stderr = c.exec_command("cat /tmp/dashboard.html")
html = stdout.read().decode("utf-8", errors="replace")

# TOKEN 검사
m = re.search(r"var TOKEN = '([^']*)'", html)
if m:
    token_val = m.group(1)
    print(f"\nTOKEN value: {token_val[:50]}..." if len(token_val) > 50 else f"\nTOKEN value: '{token_val}'")
    if token_val:
        print("TOKEN OK — 정상 렌더링")
    else:
        print("TOKEN EMPTY — 세션에 토큰 없음!")
else:
    print("\nTOKEN variable NOT FOUND in HTML")
    # 로그인 페이지로 리다이렉트됐는지 확인
    if "로그인" in html or "login" in html.lower():
        print("→ 로그인 페이지가 렌더링됨 (세션 인증 실패)")
    print("\nHTML preview (first 500 chars):\n", html[:500])

# 4. 에러 로그가 있는지 Gunicorn stderr 확인
print("\n=== Gunicorn 에러 (stderr) ===")
stdin, stdout, stderr = c.exec_command(
    "journalctl -u lumina-web --no-pager --since='5 min ago' | grep -i 'error\\|traceback\\|exception\\|import' 2>&1"
)
err = stdout.read().decode()
if err.strip():
    print(err)
else:
    print("(에러 없음)")

# 5. Python import 테스트 직접 수행
print("\n=== Python import 테스트 ===")
stdin, stdout, stderr = c.exec_command(
    'cd /opt/blossom/lumina/web && python3 -c "'
    'import sys; sys.path.insert(0, \"/opt/blossom/lumina\"); '
    'from app import create_app; '
    'app = create_app(); '
    'print(\"create_app OK\"); '
    'with app.test_client() as cl: '
    '    r = cl.post(\"/login\", data={\"emp_no\":\"admin\",\"password\":\"admin1234!\"}, follow_redirects=True); '
    '    html = r.data.decode(); '
    '    import re; '
    '    m = re.search(r\"var TOKEN = .([^.]*?).\", html); '
    '    print(\"TOKEN:\", m.group(1)[:30] if m else \"NOT FOUND\"); '
    '    print(\"Status:\", r.status_code); '
    '" 2>&1'
)
print(stdout.read().decode())

c.close()
