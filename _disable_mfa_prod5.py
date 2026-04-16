"""운영 서버에 Python 스크립트 파일 업로드 후 실행하여 MFA 비활성화"""
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

REMOTE_SCRIPT = "/tmp/_fix_mfa.py"

SCRIPT_CONTENT = '''#!/usr/bin/env python3
import sqlite3, os

db_candidates = [
    "/opt/blossom/web/instance/dev_blossom.db",
    "/opt/blossom/web/instance/blossom.db",
    "/opt/blossom/web/dev_blossom.db",
    "/opt/blossom/web/blossom.db",
]

for db_path in db_candidates:
    if not os.path.exists(db_path):
        print("SKIP %s (not found)" % db_path)
        continue
    sz = os.path.getsize(db_path)
    print("OPEN %s (%d bytes)" % (db_path, sz))
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print("  tables(%d): %s" % (len(tables), str(tables[:20])))
        if "mfa_config" in tables:
            rows = cur.execute("SELECT id, enabled, default_type, totp_enabled, totp_secret FROM mfa_config").fetchall()
            print("  mfa_config rows: %s" % str(rows))
            if rows:
                cur.execute("UPDATE mfa_config SET enabled=0 WHERE id=1")
                conn.commit()
                print("  >>> UPDATE enabled=0 DONE")
                after = cur.execute("SELECT id, enabled FROM mfa_config").fetchall()
                print("  verify: %s" % str(after))
            else:
                print("  no rows, inserting disabled default...")
                cur.execute("INSERT INTO mfa_config (id, enabled, default_type, totp_enabled) VALUES (1, 0, 'totp', 1)")
                conn.commit()
                print("  INSERT done")
        else:
            print("  NO mfa_config table in this DB")
        conn.close()
    except Exception as e:
        print("  ERROR: %s" % str(e))

print("ALL_DONE")
'''


def ssh_exec(ssh, cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    return out, err


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)

    # 1. 서비스 중지
    print("=== 서비스 중지 ===")
    out, err = ssh_exec(ssh, "systemctl stop blossom-web")
    print(f"stop: {out.strip()} {err.strip()}")

    # 2. 스크립트 업로드
    print("\n=== 스크립트 업로드 ===")
    sftp = ssh.open_sftp()
    with sftp.open(REMOTE_SCRIPT, "w") as f:
        f.write(SCRIPT_CONTENT)
    sftp.close()
    print(f"uploaded {REMOTE_SCRIPT}")

    # 3. 스크립트 실행
    print("\n=== MFA 비활성화 실행 ===")
    out, err = ssh_exec(ssh, f"python3 {REMOTE_SCRIPT}")
    print(out)
    if err.strip():
        print(f"STDERR: {err}")

    # 4. 임시 스크립트 삭제
    ssh_exec(ssh, f"rm -f {REMOTE_SCRIPT}")

    # 5. 서비스 시작
    print("\n=== 서비스 시작 ===")
    out, err = ssh_exec(ssh, "systemctl start blossom-web && sleep 3 && systemctl is-active blossom-web")
    print(out.strip())

    # 6. 검증
    print("\n=== 검증 ===")
    verify_script = '''#!/usr/bin/env python3
import requests, urllib3
urllib3.disable_warnings()

r = requests.get("https://127.0.0.1/api/mfa/status", verify=False, timeout=15)
print("MFA status:", r.status_code, r.text[:500])

r2 = requests.post("https://127.0.0.1/login",
    json={"employee_id": "ADMIN", "password": "admin123!"},
    headers={"X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json"},
    verify=False, allow_redirects=False, timeout=15)
print("Login:", r2.status_code, r2.text[:500])
print("VERIFY_DONE")
'''
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/_verify_mfa.py", "w") as f:
        f.write(verify_script)
    sftp.close()

    out, err = ssh_exec(ssh, "cd /opt/blossom/web && source venv/bin/activate && python3 /tmp/_verify_mfa.py", timeout=30)
    print(out)
    if err.strip():
        print(f"STDERR: {err[:300]}")

    ssh_exec(ssh, "rm -f /tmp/_verify_mfa.py")
    ssh.close()
    print("\n완료!")


if __name__ == "__main__":
    main()
