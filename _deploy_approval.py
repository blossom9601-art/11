#!/usr/bin/env python3
"""Lumina — 에이전트 승인 기능 배포 스크립트.

1. ttt1: DB 스키마 마이그레이션 (approval_status 컬럼 추가)
2. ttt3: WEB 앱 업데이트 (__init__.py, cli_api.py)
3. ttt3: 서비스 재시작
4. E2E 검증
"""

import os
import sys
import time

if sys.stdout.encoding and sys.stdout.encoding.lower().replace("-", "") != "utf8":
    sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)
    sys.stderr = open(sys.stderr.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)

import paramiko

SERVERS = {
    "ttt1": {"ip": "192.168.56.107", "user": "root", "pw": "123456"},
    "ttt3": {"ip": "192.168.56.108", "user": "root", "pw": "123456"},
    "ttt4": {"ip": "192.168.56.109", "user": "root", "pw": "123456"},
}

PROJECT = os.path.dirname(os.path.abspath(__file__))
DB_AP_PW = "Lumina_AP_2026!"


def ssh(hostname):
    info = SERVERS[hostname]
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(info["ip"], username=info["user"], password=info["pw"], timeout=10)
    return c


def run(c, cmd, label="", check=True):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        for line in out.splitlines():
            print(f"  [{label}] {line}")
    if err and rc != 0:
        for line in err.splitlines():
            print(f"  [{label}] ERR: {line}")
    if check and rc != 0:
        print(f"  [{label}] WARNING: exit code {rc}")
    return out, err, rc


def put_str(c, content, path, mode=0o644):
    sftp = c.open_sftp()
    with sftp.file(path, "w") as f:
        f.write(content)
    sftp.chmod(path, mode)
    sftp.close()


def put_file(c, local, remote):
    sftp = c.open_sftp()
    sftp.put(local, remote)
    sftp.close()


# ═══════════════════════════════════════════════════════════
# Phase 1: DB 마이그레이션 (ttt1)
# ═══════════════════════════════════════════════════════════
def phase1_db_migration():
    print("=" * 60)
    print(" Phase 1: DB 스키마 마이그레이션 (ttt1)")
    print("=" * 60)

    c1 = ssh("ttt1")

    migration_sql = """
-- 에이전트 승인 컬럼 추가
ALTER TABLE collected_hosts
    ADD COLUMN IF NOT EXISTS approval_status ENUM('pending','approved','rejected')
        NOT NULL DEFAULT 'pending'
        COMMENT '승인 상태' AFTER is_active,
    ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255)
        DEFAULT NULL
        COMMENT '승인자 사번' AFTER approval_status,
    ADD COLUMN IF NOT EXISTS approved_at DATETIME
        DEFAULT NULL
        COMMENT '승인 일시' AFTER approved_by;

-- 인덱스 추가
ALTER TABLE collected_hosts
    ADD KEY IF NOT EXISTS idx_approval_status (approval_status);

-- WEB reader에 UPDATE 권한 부여 (승인/거부/활성화/비활성화)
GRANT UPDATE ON lumina.collected_hosts TO 'lumina_web_reader'@'%';
FLUSH PRIVILEGES;

-- 확인
DESCRIBE collected_hosts;
SELECT id, hostname, approval_status, approved_by FROM collected_hosts;
"""

    put_str(c1, migration_sql, "/tmp/lumina_approval_migration.sql")
    run(c1,
        f"mysql -u root -e \"source /tmp/lumina_approval_migration.sql\" lumina 2>&1",
        "ttt1")
    run(c1, "rm -f /tmp/lumina_approval_migration.sql", "ttt1")

    c1.close()
    print("  DB 마이그레이션 완료\n")


# ═══════════════════════════════════════════════════════════
# Phase 2: WEB 앱 업데이트 (ttt3)
# ═══════════════════════════════════════════════════════════
def phase2_update_web():
    print("=" * 60)
    print(" Phase 2: WEB 앱 업데이트 (ttt3)")
    print("=" * 60)

    c3 = ssh("ttt3")

    # __init__.py 업로드 (새 대시보드)
    app_factory = os.path.join(PROJECT, "agents", "web", "app_factory.py")
    with open(app_factory, encoding="utf-8") as f:
        init_content = f.read()
    put_str(c3, init_content, "/opt/blossom/lumina/web/app/__init__.py")
    print("  [ttt3] __init__.py 업데이트 완료")

    # cli_api.py 업로드 (승인 엔드포인트 추가)
    cli_api = os.path.join(PROJECT, "agents", "web", "cli_api.py")
    with open(cli_api, encoding="utf-8") as f:
        cli_content = f.read()
    put_str(c3, cli_content, "/opt/blossom/lumina/web/app/cli_api.py")
    print("  [ttt3] cli_api.py 업데이트 완료")

    # CRLF → LF 변환
    run(c3, "sed -i 's/\\r$//' /opt/blossom/lumina/web/app/__init__.py /opt/blossom/lumina/web/app/cli_api.py", "ttt3")

    c3.close()
    print("  WEB 앱 업데이트 완료\n")


# ═══════════════════════════════════════════════════════════
# Phase 3: 서비스 재시작 (ttt3)
# ═══════════════════════════════════════════════════════════
def phase3_restart():
    print("=" * 60)
    print(" Phase 3: 서비스 재시작 (ttt3)")
    print("=" * 60)

    c3 = ssh("ttt3")

    # SELinux 컨텍스트 재설정
    run(c3, """
chown -R nginx:nginx /var/log/blossom/lumina/web/ 2>/dev/null || true
chmod 755 /var/log/blossom /var/log/blossom/lumina /var/log/blossom/lumina/web 2>/dev/null || true
chcon -R -t httpd_log_t /var/log/blossom/lumina/web/ 2>/dev/null || true
chcon -t cert_t /etc/blossom/lumina/tls/*.crt /etc/blossom/lumina/tls/*.key 2>/dev/null || true
""", "ttt3")

    run(c3, "systemctl restart lumina-web", "ttt3")
    time.sleep(3)
    run(c3, "systemctl restart nginx", "ttt3")
    time.sleep(2)

    # 상태 확인
    run(c3, "systemctl is-active lumina-web nginx", "ttt3")

    c3.close()
    print("  서비스 재시작 완료\n")


# ═══════════════════════════════════════════════════════════
# Phase 4: E2E 검증
# ═══════════════════════════════════════════════════════════
def phase4_verify():
    print("=" * 60)
    print(" Phase 4: E2E 검증")
    print("=" * 60)

    c3 = ssh("ttt3")

    # 헬스체크
    print("\n  === 헬스체크 ===")
    run(c3, "curl -sk https://127.0.0.1/health 2>&1", "ttt3")

    # 로그인 페이지 접근 (/ → /login 리다이렉트)
    print("\n  === 로그인 페이지 ===")
    run(c3, "curl -sk -o /dev/null -w '%{http_code} %{redirect_url}' https://127.0.0.1/ 2>&1", "ttt3")

    # CLI 로그인 + 에이전트 목록
    print("\n  === CLI 로그인 ===")
    out, _, _ = run(c3,
        """curl -sk -X POST https://127.0.0.1/api/cli/login """
        """-H 'Content-Type: application/json' """
        """-d '{"emp_no":"admin","password":"admin1234!"}' 2>&1""",
        "ttt3")

    # 토큰 추출해서 에이전트 목록 조회
    import json
    try:
        resp = json.loads(out)
        token = resp.get("token", "")
        if token:
            print("\n  === 에이전트 목록 (approval_status 확인) ===")
            run(c3,
                f"""curl -sk https://127.0.0.1/api/cli/agents """
                f"""-H 'Authorization: Bearer {token}' 2>&1""",
                "ttt3")

            # 에이전트 승인 테스트
            print("\n  === 에이전트 승인 테스트 (ID=4) ===")
            run(c3,
                f"""curl -sk -X POST https://127.0.0.1/api/cli/agents/4/approve """
                f"""-H 'Authorization: Bearer {token}' """
                f"""-H 'Content-Type: application/json' 2>&1""",
                "ttt3")

            # 승인 후 상태 확인
            print("\n  === 승인 후 에이전트 목록 ===")
            run(c3,
                f"""curl -sk https://127.0.0.1/api/cli/agents """
                f"""-H 'Authorization: Bearer {token}' 2>&1""",
                "ttt3")
        else:
            print("  토큰 없음 — 로그인 실패")
    except Exception as e:
        print(f"  JSON 파싱 오류: {e}")

    c3.close()

    # 외부 접근 테스트 (ttt4에서)
    print("\n  === 외부 접근 테스트 (ttt4 → ttt3) ===")
    c4 = ssh("ttt4")
    run(c4, "curl -sk https://192.168.56.108/health 2>&1", "ttt4")
    run(c4, "curl -sk -o /dev/null -w '%{http_code}' https://192.168.56.108/ 2>&1", "ttt4")
    c4.close()

    print("\n" + "=" * 60)
    print(" 배포 완료!")
    print("=" * 60)
    print("""
  에이전트 관리 콘솔:  https://192.168.56.108
  로그인:              admin / admin1234!

  기능:
    - 에이전트 목록 확인 (승인 상태 포함)
    - 에이전트 승인/거부
    - 30초 자동 갱신
    - 승인된 에이전트만 연동
""")


# ═══════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════
if __name__ == "__main__":
    try:
        phase1_db_migration()
        phase2_update_web()
        phase3_restart()
        phase4_verify()
    except Exception as e:
        import traceback
        print(f"\n*** ERROR: {e}")
        traceback.print_exc()
