#!/usr/bin/env python3
"""Fix round 4: AP 500 error diagnosis + fix, then E2E verification."""
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
# Diag 1: AP 서버 500 에러 원인 파악
# ═══════════════════════════════════════════════════════
print("=" * 60)
print(" Diag: ttt2 AP — 500 에러 로그 확인")
print("=" * 60)

c2 = ssh("192.168.56.106")

# AP 로그 확인
run(c2, "journalctl -u lumina-ap --no-pager -n 30 2>&1 | tail -30", "ttt2")

# AP 상세 로그 파일 확인
run(c2, "cat /var/log/blossom/lumina/ap/ap.log 2>&1 | tail -30", "ttt2")

# 직접 테스트 (curl 로 AP에 데이터 전송)
run(c2, """
curl -sk -X POST https://127.0.0.1:5100/api/agent/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer lumina-test-token-2026-changeme" \
  -d '{"hostname":"test","os_type":"Linux","os_version":"8.10","collected_at":"2026-04-11 00:00:00","interfaces":[],"accounts":[],"packages":[]}' \
  2>&1
""", "ttt2")

c2.close()

# ═══════════════════════════════════════════════════════
# Diag 2: AP → DB 연결 문제? MariaDB 원격 접속 확인
# ═══════════════════════════════════════════════════════
print()
print("=" * 60)
print(" Diag: ttt2 AP → ttt1 DB 연결 확인")
print("=" * 60)

c2 = ssh("192.168.56.106")

# PyMySQL로 DB 연결 테스트
run(c2, """
python3 -c "
import pymysql
try:
    conn = pymysql.connect(host='192.168.56.107', port=3306,
                           user='lumina_ap_writer', password='Lumina_AP_2026!',
                           database='lumina', charset='utf8mb4')
    cur = conn.cursor()
    cur.execute('SHOW TABLES')
    tables = [r[0] for r in cur.fetchall()]
    print('DB OK, tables:', tables)
    conn.close()
except Exception as e:
    print('DB ERROR:', e)
"
""", "ttt2")

c2.close()

print()
print("=" * 60)
print(" Diag 완료 — 위 결과에 따라 수정 진행")
print("=" * 60)
