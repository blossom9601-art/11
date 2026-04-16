"""운영 서버 SQLite DB에서 MFA 비활성화"""
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"


def ssh_exec(ssh, cmd, timeout=15):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    return stdout.read().decode("utf-8", "replace"), stderr.read().decode("utf-8", "replace")


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)

    # 1. SQLite DB 파일 찾기
    print("=== SQLite DB 파일 위치 ===")
    out, _ = ssh_exec(ssh, "find /opt/blossom/web -name '*.db' -type f 2>/dev/null")
    print(out)

    out, _ = ssh_exec(ssh, "ls -la /opt/blossom/web/instance/ 2>/dev/null || echo 'NO instance dir'")
    print(out)

    # 2. mfa_config 테이블 확인
    db_paths = [
        "/opt/blossom/web/instance/blossom.db",
        "/opt/blossom/web/instance/dev_blossom.db",
        "/opt/blossom/web/blossom.db",
    ]

    for db_path in db_paths:
        print(f"\n=== {db_path} ===")
        out, err = ssh_exec(ssh, f"sqlite3 {db_path} '.tables' 2>/dev/null || echo 'NOT_FOUND'")
        if "NOT_FOUND" in out or "unable to open" in err.lower():
            print(f"  DB 없음: {db_path}")
            continue

        print("  테이블 있음, mfa_config 확인...")
        out, _ = ssh_exec(ssh, f"sqlite3 {db_path} 'SELECT * FROM mfa_config;' 2>/dev/null || echo 'NO_MFA_TABLE'")
        print(f"  mfa_config: {out.strip()}")

        if "NO_MFA_TABLE" not in out:
            # MFA 비활성화
            print(f"\n  >>> MFA 비활성화 중...")
            cmd = f"sqlite3 {db_path} \"UPDATE mfa_config SET enabled=0 WHERE id=1;\""
            out, err = ssh_exec(ssh, cmd)
            if err.strip():
                print(f"  ERR: {err}")
            else:
                print(f"  UPDATE 완료")

            # 확인
            out, _ = ssh_exec(ssh, f"sqlite3 {db_path} 'SELECT id, enabled, totp_enabled, email_enabled, sms_enabled, totp_secret FROM mfa_config;'")
            print(f"  확인: {out.strip()}")

    # 3. 서비스 재시작
    print("\n=== 서비스 재시작 ===")
    out, _ = ssh_exec(ssh, "systemctl restart blossom-web && sleep 3 && systemctl is-active blossom-web", timeout=30)
    print(out.strip())

    # 4. 검증
    print("\n=== 검증 ===")
    verify_cmd = """cd /opt/blossom/web && source venv/bin/activate && python3 << 'PYEOF'
import requests, urllib3
urllib3.disable_warnings()

r = requests.get("https://127.0.0.1/api/mfa/status", verify=False, timeout=15)
print("MFA status:", r.status_code, r.text[:300])

r2 = requests.post("https://127.0.0.1/login",
    data={"employee_id": "ADMIN", "password": "admin123!"},
    headers={"X-Requested-With": "XMLHttpRequest"},
    verify=False, allow_redirects=False, timeout=15)
print("Login:", r2.status_code, r2.text[:300])
print("VERIFY_DONE")
PYEOF
"""
    out, err = ssh_exec(ssh, verify_cmd, timeout=30)
    print(out)
    if err.strip():
        for line in err.strip().split("\n"):
            if "InsecureRequestWarning" not in line and "urllib3" not in line:
                print(f"  ERR: {line}")

    ssh.close()
    print("\n완료!")


if __name__ == "__main__":
    main()
