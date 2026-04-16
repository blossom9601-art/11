#!/usr/bin/env python3
"""Fix 1: ttt3 NGINX / Fix 2: ttt4 Agent"""
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

# ── Fix 1: ttt3 NGINX ──────────────────────────────────
print("=" * 60)
print(" Fix 1: ttt3 NGINX config 복원")
print("=" * 60)

c3 = ssh("192.168.56.108")

# nginx.conf 복원 (패키지 재설치)
run(c3, "dnf reinstall -y nginx 2>&1 | tail -5", "ttt3")

# default.conf 삭제 (lumina.conf만 사용)
run(c3, "rm -f /etc/nginx/conf.d/default.conf", "ttt3")

# lumina.conf 확인
run(c3, "ls -la /etc/nginx/conf.d/", "ttt3")

# nginx 테스트
run(c3, "nginx -t 2>&1", "ttt3")

# nginx 재시작
run(c3, "systemctl restart nginx && systemctl enable nginx", "ttt3")
run(c3, "systemctl is-active nginx", "ttt3")

# WEB via nginx 확인
run(c3, "curl -s http://127.0.0.1/health 2>&1", "ttt3")

c3.close()

# ── Fix 2: ttt4 Agent ──────────────────────────────────
print()
print("=" * 60)
print(" Fix 2: ttt4 Agent 로그 경로 + config 경로 수정")
print("=" * 60)

c4 = ssh("192.168.56.109")

# 기본 로그 경로 패치: /var/log/lumina/ -> /var/log/blossom/lumina/agent/
run(c4, r"""
cd /opt/blossom/lumina/agent
grep -c '/var/log/lumina' agent.py
sed -i 's|/var/log/lumina/lumina.log|/var/log/blossom/lumina/agent/lumina.log|g' agent.py
sed -i 's|/etc/lumina/lumina.conf|/etc/blossom/lumina/agent.conf|g' agent.py
grep -n 'var/log' agent.py | head -5
grep -n 'etc/' agent.py | head -5
""", "ttt4")

# 디렉토리 권한 확인
run(c4, """
mkdir -p /var/log/blossom/lumina/agent
chown -R lumina:lumina /var/log/blossom/lumina
chmod 750 /var/log/blossom/lumina/agent
ls -la /var/log/blossom/lumina/
""", "ttt4")

# Agent 재시작
run(c4, "systemctl stop lumina-agent", "ttt4")
time.sleep(1)
run(c4, "systemctl start lumina-agent", "ttt4")
time.sleep(3)

# 상태 확인
run(c4, "systemctl status lumina-agent --no-pager 2>&1 | head -15", "ttt4")

# 로그 확인
run(c4, "journalctl -u lumina-agent --no-pager -n 25 2>&1 | tail -25", "ttt4")

c4.close()

print()
print("=" * 60)
print(" 수정 완료")
print("=" * 60)
