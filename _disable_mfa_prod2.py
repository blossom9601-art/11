"""운영 서버 DB 설정 확인 + MFA 비활성화"""
import paramiko

HOST_WEB = "192.168.56.108"  # ttt3 (WEB)
HOST_DB  = "192.168.56.107"  # ttt1 (DB)
USER = "root"
PASS = "123456"


def ssh_exec(ssh, cmd, timeout=15):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    return stdout.read().decode("utf-8", "replace"), stderr.read().decode("utf-8", "replace")


def check_web_service(ssh):
    """blossom-web 서비스의 실제 설정 확인"""
    print("=== blossom-web service ===")
    out, _ = ssh_exec(ssh, "systemctl cat blossom-web 2>/dev/null || echo NO_UNIT")
    print(out[:1500])

    print("\n=== gunicorn process env (DATABASE_URL) ===")
    cmd = "cat /proc/$(pgrep -f 'gunicorn.*blossom' | head -1)/environ 2>/dev/null | tr '\\0' '\\n' | grep -i 'database\\|DB_' || echo 'NO_DB_ENV_FOUND'"
    out, _ = ssh_exec(ssh, cmd)
    print(out)

    print("\n=== wsgi.py ===")
    out, _ = ssh_exec(ssh, "cat /opt/blossom/web/wsgi.py 2>/dev/null || echo NO_WSGI")
    print(out[:500])


def disable_mfa_via_db_server():
    """DB 서버(ttt1)에 직접 접속하여 MFA 비활성화"""
    print("\n" + "=" * 50)
    print("[DB] 192.168.56.107에서 MFA 비활성화 시도...")
    print("=" * 50)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(HOST_DB, username=USER, password=PASS, timeout=10)
    except Exception as e:
        print(f"DB 서버 접속 실패: {e}")
        return False

    # lumina DB에서 MFA 비활성화
    sql_cmd = """mysql -u lumina_admin -p'LuminaAdmin2026Secure' lumina -e "
        SELECT id, enabled, totp_enabled, email_enabled, sms_enabled, totp_secret FROM mfa_config;
        UPDATE mfa_config SET enabled=0 WHERE id=1;
        SELECT id, enabled FROM mfa_config;
    " 2>&1"""
    out, err = ssh_exec(ssh, sql_cmd, timeout=15)
    print(out)
    if err.strip():
        print(f"ERR: {err[:500]}")

    ssh.close()
    return "enabled" in out.lower() or "0" in out


def disable_mfa_via_web_python(ssh):
    """WEB 서버에서 Flask app context로 MFA 비활성화 (DB가 접근 가능한 경우)"""
    print("\n" + "=" * 50)
    print("[WEB] Flask app context로 MFA 비활성화 시도...")
    print("=" * 50)

    # gunicorn의 실제 환경변수에서 DATABASE_URL 추출
    cmd = "cat /proc/$(pgrep -f 'gunicorn.*blossom' | head -1)/environ 2>/dev/null | tr '\\0' '\\n' | grep DATABASE_URL || echo ''"
    out, _ = ssh_exec(ssh, cmd)
    db_url = out.strip()
    if not db_url:
        print("gunicorn 환경변수에서 DATABASE_URL을 찾지 못했습니다")
        return False

    print(f"DB URL: {db_url}")

    # heredoc으로 Flask 실행
    flask_cmd = f"""cd /opt/blossom/web && source venv/bin/activate && export {db_url} && python3 << 'PYEOF'
import os
from app import create_app
app = create_app()
with app.app_context():
    from app.models import db, MfaConfig
    cfg = MfaConfig.query.filter_by(id=1).first()
    if cfg:
        print("Before: enabled =", cfg.enabled)
        cfg.enabled = False
        db.session.commit()
        cfg2 = MfaConfig.query.filter_by(id=1).first()
        print("After:  enabled =", cfg2.enabled)
    else:
        print("No MfaConfig row found")
    print("MFA_DISABLE_DONE")
PYEOF
"""
    out, err = ssh_exec(ssh, flask_cmd, timeout=30)
    print(out)
    if err.strip():
        for line in err.strip().split("\n"):
            if "Warning" not in line:
                print(f"ERR: {line}")
    return "MFA_DISABLE_DONE" in out


def verify_login(ssh):
    """로그인 검증"""
    print("\n" + "=" * 50)
    print("[검증] 로그인 테스트...")
    print("=" * 50)

    # gunicorn 환경에서 DATABASE_URL 추출
    cmd = "cat /proc/$(pgrep -f 'gunicorn.*blossom' | head -1)/environ 2>/dev/null | tr '\\0' '\\n' | grep DATABASE_URL || echo ''"
    out, _ = ssh_exec(ssh, cmd)
    db_url = out.strip()

    verify_cmd = f"""cd /opt/blossom/web && source venv/bin/activate && export {db_url} && python3 << 'PYEOF'
import requests, urllib3
urllib3.disable_warnings()

r = requests.get("https://127.0.0.1/login", verify=False, timeout=15)
print("GET /login:", r.status_code)

r2 = requests.get("https://127.0.0.1/api/mfa/status", verify=False, timeout=15)
print("GET /api/mfa/status:", r2.status_code, r2.text[:200])

r3 = requests.post("https://127.0.0.1/login",
    data={{"employee_id": "ADMIN", "password": "admin123!"}},
    headers={{"X-Requested-With": "XMLHttpRequest"}},
    verify=False, allow_redirects=False, timeout=15)
print("POST /login:", r3.status_code, r3.text[:300])
print("VERIFY_DONE")
PYEOF
"""
    out, err = ssh_exec(ssh, verify_cmd, timeout=30)
    print(out)
    if err.strip():
        for line in err.strip().split("\n"):
            if "InsecureRequestWarning" not in line and "urllib3" not in line:
                print(f"ERR: {line}")


def main():
    # 1. WEB 서버 접속 & 서비스 설정 확인
    ssh_web = paramiko.SSHClient()
    ssh_web.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_web.connect(HOST_WEB, username=USER, password=PASS, timeout=10)

    check_web_service(ssh_web)

    # 2. DB 서버에서 직접 MFA 비활성화
    db_ok = disable_mfa_via_db_server()

    if not db_ok:
        # 3. WEB 서버에서 Flask로 시도
        disable_mfa_via_web_python(ssh_web)

    # 4. 서비스 재시작
    print("\n서비스 재시작 중...")
    out, _ = ssh_exec(ssh_web, "systemctl restart blossom-web && sleep 3 && systemctl is-active blossom-web", timeout=30)
    print(out)

    # 5. 검증
    verify_login(ssh_web)

    ssh_web.close()
    print("\n완료!")


if __name__ == "__main__":
    main()
