#!/usr/bin/env python3
"""Fix round 3: Agent conf permission + WEB Gunicorn 502."""
import paramiko
import time

def ssh(ip, pw="123456"):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(ip, username="root", password=pw, timeout=10)
    return c

def run(c, cmd, label=""):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        for line in out.splitlines():
            print(f"  [{label}] {line}")
    if err:
        for line in err.splitlines():
            print(f"  [{label}] {'ERR: ' if rc != 0 else ''}{line}")
    return out, err, rc


# ═══════════════════════════════════════════════════════
# Fix 1: ttt4 Agent conf 파일 권한
# ═══════════════════════════════════════════════════════
print("=" * 60)
print(" Fix 1: ttt4 Agent — conf 파일 권한 수정")
print("=" * 60)

c4 = ssh("192.168.56.109")

# conf 파일 소유자 변경 + __pycache__ 삭제
run(c4, """
# agent.conf 를 lumina 사용자가 읽을 수 있도록
chown root:lumina /etc/blossom/lumina/agent.conf
chmod 640 /etc/blossom/lumina/agent.conf
ls -la /etc/blossom/lumina/agent.conf

# common.conf 도 마찬가지
chown root:lumina /etc/blossom/lumina/common.conf 2>/dev/null || true

# __pycache__ 삭제 (캐시된 .pyc 제거)
find /opt/blossom/lumina -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null

# TLS 인증서 파일도 lumina 읽기 가능하게
chown root:lumina /etc/blossom/lumina/tls/*.crt
chmod 644 /etc/blossom/lumina/tls/*.crt
chown root:lumina /etc/blossom/lumina/tls/client.key
chmod 640 /etc/blossom/lumina/tls/client.key

echo "권한 수정 완료"
ls -la /etc/blossom/lumina/
ls -la /etc/blossom/lumina/tls/
""", "ttt4")

# lumina 사용자로 config 테스트
run(c4, """
su -s /bin/bash lumina -c '
python3 -c "
import sys; sys.path.insert(0, \\"/opt/blossom/lumina\\")
from common.config import AgentConfig
c = AgentConfig(\\"/etc/blossom/lumina/agent.conf\\")
print(\\"server_url:\\", c.server_url)
print(\\"output_dir:\\", c.output_dir)
print(\\"log_file:\\", c.log_file)
print(\\"OK\\")
"
'
""", "ttt4")

# Agent 재시작
run(c4, "systemctl stop lumina-agent 2>/dev/null", "ttt4")
time.sleep(1)
run(c4, "systemctl start lumina-agent", "ttt4")
time.sleep(5)

run(c4, "systemctl status lumina-agent --no-pager 2>&1 | head -15", "ttt4")
run(c4, "journalctl -u lumina-agent --no-pager -n 15 2>&1 | tail -15", "ttt4")

c4.close()


# ═══════════════════════════════════════════════════════
# Fix 2: ttt3 WEB — Gunicorn 502 진단/수정
# ═══════════════════════════════════════════════════════
print()
print("=" * 60)
print(" Fix 2: ttt3 WEB — Gunicorn 502 진단")
print("=" * 60)

c3 = ssh("192.168.56.108")

# Gunicorn 상태 확인
run(c3, "systemctl status lumina-web --no-pager 2>&1 | head -15", "ttt3")
run(c3, "journalctl -u lumina-web --no-pager -n 20 2>&1 | tail -20", "ttt3")

# 직접 Gunicorn 테스트
run(c3, "curl -s http://127.0.0.1:8000/health 2>&1", "ttt3")

# Gunicorn 재시작 (SELinux 등 문제일 수 있으므로)
run(c3, """
# SELinux 값 확인
getenforce 2>/dev/null || echo "SELinux not installed"
# httpd가 network 연결 가능하도록
setsebool -P httpd_can_network_connect 1 2>/dev/null || true
""", "ttt3")

# Gunicorn이 실패했으면 로그 확인 후 재시작
run(c3, """
systemctl restart lumina-web
sleep 2
systemctl status lumina-web --no-pager | head -10
""", "ttt3")

# 헬스체크
time.sleep(2)
run(c3, "curl -s http://127.0.0.1:8000/health 2>&1", "ttt3")

# NGINX through
run(c3, "curl -s http://127.0.0.1/health 2>&1", "ttt3")

c3.close()


print()
print("=" * 60)
print(" Fix round 3 완료")
print("=" * 60)
