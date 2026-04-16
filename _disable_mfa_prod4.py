"""운영 서버 SQLite DB에서 MFA 비활성화 — Python sqlite3 모듈 사용"""
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"


def ssh_exec(ssh, cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    return out, err


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)

    # 1. 서비스 중지 (DB 잠금 해제)
    print("=== 서비스 중지 ===")
    out, err = ssh_exec(ssh, "systemctl stop blossom-web")
    print(f"stop: {out.strip()} {err.strip()}")

    # 2. Python으로 직접 SQLite DB 접근
    print("\n=== MFA 비활성화 (Python sqlite3) ===")
    py_script = r"""
import sqlite3, os, glob

db_candidates = [
    '/opt/blossom/web/instance/dev_blossom.db',
    '/opt/blossom/web/instance/blossom.db',
    '/opt/blossom/web/dev_blossom.db',
    '/opt/blossom/web/blossom.db',
]

for db_path in db_candidates:
    if not os.path.exists(db_path):
        print(f'SKIP {db_path} (not found)')
        continue
    print(f'OPEN {db_path} ({os.path.getsize(db_path)} bytes)')
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print(f'  tables({len(tables)}): {tables[:20]}')
        if 'mfa_config' in tables:
            rows = cur.execute('SELECT id, enabled, default_type, totp_enabled, totp_secret FROM mfa_config').fetchall()
            print(f'  mfa_config rows: {rows}')
            if rows:
                cur.execute('UPDATE mfa_config SET enabled=0 WHERE id=1')
                conn.commit()
                print('  >>> UPDATE enabled=0 DONE')
                after = cur.execute('SELECT id, enabled FROM mfa_config').fetchall()
                print(f'  verify: {after}')
            else:
                print('  no rows, inserting disabled default...')
                cur.execute("INSERT INTO mfa_config (id, enabled, default_type, totp_enabled) VALUES (1, 0, 'totp', 1)")
                conn.commit()
                print('  INSERT done')
        else:
            print(f'  NO mfa_config table in this DB')
        conn.close()
    except Exception as e:
        print(f'  ERROR: {e}')
print('ALL_DONE')
"""
    out, err = ssh_exec(ssh, f"python3 -c {repr(py_script)}")
    print(out)
    if err.strip():
        print(f"STDERR: {err}")

    # 3. 서비스 시작
    print("\n=== 서비스 시작 ===")
    out, err = ssh_exec(ssh, "systemctl start blossom-web && sleep 3 && systemctl is-active blossom-web")
    print(out.strip())

    # 4. 검증
    print("\n=== 검증 ===")
    verify_cmd = """cd /opt/blossom/web && source venv/bin/activate && python3 << 'PYEOF'
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
PYEOF
"""
    out, err = ssh_exec(ssh, verify_cmd, timeout=30)
    print(out)
    if err.strip():
        print(f"STDERR: {err[:300]}")

    ssh.close()
    print("\n완료!")


if __name__ == "__main__":
    main()
