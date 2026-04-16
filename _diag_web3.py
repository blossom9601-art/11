#!/usr/bin/env python3
"""Lumina WEB — NGINX 접근 로그 + 브라우저 JS 디버깅."""
import paramiko, json, sys, re

sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

# 1. NGINX 접근 로그에서 /api/cli/agents 확인
print("=== NGINX access log (최근 /api/ 요청) ===")
stdin, stdout, stderr = c.exec_command(
    "tail -30 /var/log/blossom/lumina/web/access.log 2>&1 | grep -E '/api/|/ |/login'"
)
print(stdout.read().decode("utf-8", errors="replace"))

# 2. NGINX 에러 로그 확인
print("\n=== NGINX error log (최근 10줄) ===")
stdin, stdout, stderr = c.exec_command(
    "tail -10 /var/log/blossom/lumina/web/error.log 2>&1"
)
print(stdout.read().decode("utf-8", errors="replace"))

# 3. Gunicorn stdout/stderr 확인
print("\n=== Gunicorn 로그 (최근 20줄, 에러 포커스) ===")
stdin, stdout, stderr = c.exec_command(
    "journalctl -u lumina-web --no-pager -n 30 2>&1 | grep -v 'systemd\\[1\\]'"
)
print(stdout.read().decode("utf-8", errors="replace"))

# 4. 실제 렌더링되는 HTML에서 script 부분만 추출
print("\n=== 렌더링된 JS 코드 (TOKEN 주변) ===")
stdin, stdout, stderr = c.exec_command(
    "cat /tmp/dashboard.html | grep -A5 'var TOKEN'"
)
print(stdout.read().decode("utf-8", errors="replace"))

# 5. 렌더링된 HTML에서 api 함수 확인
print("\n=== api() 함수 코드 ===")
stdin, stdout, stderr = c.exec_command(
    "cat /tmp/dashboard.html | grep -A15 'function api'"
)
print(stdout.read().decode("utf-8", errors="replace"))

# 6. loadAgents 함수 - 첫 부분
print("\n=== loadAgents() 코드 ===")
stdin, stdout, stderr = c.exec_command(
    "cat /tmp/dashboard.html | grep -A5 'function loadAgents'"
)
print(stdout.read().decode("utf-8", errors="replace"))

# 7. 브라우저 외부 IP로 API 호출 테스트 (CORS 등)
print("\n=== 외부 IP API 호출 테스트 ===")
stdin, stdout, stderr = c.exec_command(
    'curl -sk -o /dev/null -w "HTTP %{http_code}" '
    'https://192.168.56.108/api/cli/agents '
    '-H "Authorization: Bearer invalid_token" 2>&1'
)
print("Without valid token:", stdout.read().decode())

# 8. 실제 HTML 전체 크기 확인
stdin, stdout, stderr = c.exec_command("wc -c /tmp/dashboard.html")
print("\nDashboard HTML size:", stdout.read().decode().strip())

c.close()
