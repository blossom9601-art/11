"""운영 서버 MFA 비활성화 + 검증"""
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

DB_URL = "mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"

# Flask app context에서 MFA disable
REMOTE_SCRIPT = r"""
cd /opt/blossom/web
source venv/bin/activate
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
python3 << 'PYEOF'
import os
os.environ.setdefault("DATABASE_URL", "mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4")
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
        print("No MfaConfig row (id=1) found — MFA was never configured")
    print("MFA_DISABLE_DONE")
PYEOF
"""

# 검증: 로그인 시도
VERIFY_SCRIPT = r"""
cd /opt/blossom/web
source venv/bin/activate
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
python3 << 'PYEOF'
import requests, urllib3
urllib3.disable_warnings()

print("--- GET /login ---")
try:
    r = requests.get("https://127.0.0.1/login", verify=False, timeout=10)
    print("Status:", r.status_code)
except Exception as e:
    print("ERROR:", e)

print("\n--- GET /api/mfa/status ---")
try:
    r2 = requests.get("https://127.0.0.1/api/mfa/status", verify=False, timeout=10)
    print("Status:", r2.status_code)
    print("Body:", r2.text[:200])
except Exception as e:
    print("ERROR:", e)

print("\n--- POST /login (AJAX) ---")
try:
    r3 = requests.post("https://127.0.0.1/login",
        data={"employee_id": "ADMIN", "password": "admin123!"},
        headers={"X-Requested-With": "XMLHttpRequest"},
        verify=False, allow_redirects=False, timeout=10)
    print("Status:", r3.status_code)
    print("Body:", r3.text[:300])
except Exception as e:
    print("ERROR:", e)
print("\nVERIFY_DONE")
PYEOF
"""


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)

    # Step 1: Disable MFA
    print("=" * 50)
    print("[1] MFA 비활성화...")
    print("=" * 50)
    _, stdout, stderr = ssh.exec_command(REMOTE_SCRIPT, timeout=30)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    print(out)
    if err.strip():
        for line in err.strip().split("\n"):
            if "Warning" not in line and "urllib3" not in line:
                print(f"  ERR: {line}")

    if "MFA_DISABLE_DONE" in out:
        print("[OK] MFA 비활성화 완료\n")
    else:
        print("[WARN] MFA 비활성화 확인 불가\n")

    # Step 2: Verify login
    print("=" * 50)
    print("[2] 로그인 검증...")
    print("=" * 50)
    _, stdout, stderr = ssh.exec_command(VERIFY_SCRIPT, timeout=30)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    print(out)
    if err.strip():
        for line in err.strip().split("\n"):
            if "InsecureRequestWarning" not in line and "urllib3" not in line:
                print(f"  ERR: {line}")

    ssh.close()
    print("\n완료!")


if __name__ == "__main__":
    main()
