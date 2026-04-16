#!/usr/bin/env python3
"""Fix round 5: mac_address column too short + Agent restart."""
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
# Fix 1: ttt1 DB — mac_address 컬럼 확장
# ═══════════════════════════════════════════════════════
print("=" * 60)
print(" Fix 1: ttt1 DB — mac_address VARCHAR(17) → VARCHAR(100)")
print("=" * 60)

c1 = ssh("192.168.56.107")

run(c1, """
mysql -u root -e "
USE lumina;
ALTER TABLE collected_interfaces MODIFY COLUMN mac_address VARCHAR(100) DEFAULT NULL COMMENT '마스킹 가능';
DESCRIBE collected_interfaces;
" 2>&1
""", "ttt1")

c1.close()
print("  DB 스키마 수정 완료\n")

# ═══════════════════════════════════════════════════════
# Fix 2: ttt4 Agent 재시작 → 재전송
# ═══════════════════════════════════════════════════════
print("=" * 60)
print(" Fix 2: ttt4 Agent 재시작 → 즉시 수집/전송")
print("=" * 60)

c4 = ssh("192.168.56.109")

# Agent 재시작
run(c4, "systemctl restart lumina-agent", "ttt4")
time.sleep(8)

# 로그 확인
run(c4, "journalctl -u lumina-agent --no-pager -n 15 --since='1 min ago' 2>&1 | tail -15", "ttt4")

c4.close()

# ═══════════════════════════════════════════════════════
# Verify: E2E 검증
# ═══════════════════════════════════════════════════════
print()
print("=" * 60)
print(" E2E 검증: AP 로그 + DB 데이터")
print("=" * 60)

# AP 로그 확인
c2 = ssh("192.168.56.106")
print("\n[ttt2] AP 최근 로그:")
run(c2, "journalctl -u lumina-ap --no-pager -n 10 --since='1 min ago' 2>&1 | tail -10", "ttt2")
c2.close()

# DB 데이터 확인
c1 = ssh("192.168.56.107")
print("\n[ttt1] DB 수집 데이터:")
run(c1, """
mysql -u root -e "
USE lumina;
SELECT '=== collected_hosts ===' AS info;
SELECT id, hostname, os_type, os_version, last_seen, is_active FROM collected_hosts;

SELECT '=== collected_interfaces (sample) ===' AS info;
SELECT host_id, name, ip_address, mac_address, status FROM collected_interfaces LIMIT 10;

SELECT '=== collected_accounts (count) ===' AS info;
SELECT host_id, COUNT(*) as cnt FROM collected_accounts GROUP BY host_id;

SELECT '=== collected_packages (count) ===' AS info;
SELECT host_id, COUNT(*) as cnt FROM collected_packages GROUP BY host_id;

SELECT '=== collection_log ===' AS info;
SELECT host_id, collected_at, interface_count, account_count, package_count, status, source_ip
FROM collection_log ORDER BY id DESC LIMIT 5;
" 2>&1
""", "ttt1")
c1.close()

# WEB 대시보드 확인
c3 = ssh("192.168.56.108")
print("\n[ttt3] WEB API 요약:")
run(c3, "curl -s http://127.0.0.1/api/dashboard/summary 2>&1", "ttt3")
c3.close()

print()
print("=" * 60)
print(" 전체 상태 요약")
print("=" * 60)

for name, ip, role in [("ttt1", "192.168.56.107", "DB"),
                        ("ttt2", "192.168.56.106", "AP"),
                        ("ttt3", "192.168.56.108", "WEB"),
                        ("ttt4", "192.168.56.109", "Agent")]:
    c = ssh(ip)
    if role == "DB":
        out, _, _ = run(c, "systemctl is-active mariadb", name)
    elif role == "AP":
        out, _, _ = run(c, "systemctl is-active lumina-ap", name)
    elif role == "WEB":
        out1, _, _ = run(c, "systemctl is-active lumina-web", name)
        out2, _, _ = run(c, "systemctl is-active nginx", name)
    elif role == "Agent":
        out, _, _ = run(c, "systemctl is-active lumina-agent", name)
    c.close()

print()
print("=" * 60)
print(" 완료!")
print("=" * 60)
