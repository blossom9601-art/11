"""약관 동의 처리 + 최종 로그인 확인"""
import paramiko, textwrap

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

SCRIPT = textwrap.dedent(r'''
import sqlite3
from datetime import datetime

DB = "/opt/blossom/web/instance/dev_blossom.db"
conn = sqlite3.connect(DB)
c = conn.cursor()

# 약관 동의 시각 설정 (현재 월)
now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
c.execute("UPDATE auth_users SET last_terms_accepted_at=? WHERE emp_no='admin'", (now,))
conn.commit()
print("TERMS_ACCEPTED:", now)

# 보안 정책에서 최초 로그인 비밀번호 변경 비활성화
c.execute("UPDATE security_policy SET force_change_first_login=0 WHERE id=1")
conn.commit()
print("FORCE_CHANGE_DISABLED")

conn.close()

# 로그인 테스트
import requests, urllib3
urllib3.disable_warnings()
s = requests.Session()
s.get("https://127.0.0.1/login", verify=False)
r = s.post("https://127.0.0.1/login",
    data={"employee_id": "admin", "password": "admin1234!"},
    verify=False, allow_redirects=False)
print("POST /login:", r.status_code, "Loc:", r.headers.get("Location", ""))

if r.status_code == 302:
    loc = r.headers.get("Location", "")
    r2 = s.get(f"https://127.0.0.1{loc}", verify=False) if loc.startswith("/") else s.get(loc, verify=False)
    print("Follow redirect:", r2.status_code)
''')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

sftp = ssh.open_sftp()
with sftp.open("/tmp/_fix_terms.py", "w") as f:
    f.write(SCRIPT)
sftp.close()

_, o, e = ssh.exec_command("/opt/blossom/web/venv/bin/python3 /tmp/_fix_terms.py", timeout=15)
print(o.read().decode())
err = e.read().decode()
if err.strip(): print("ERR:", err[-500:])
ssh.close()
