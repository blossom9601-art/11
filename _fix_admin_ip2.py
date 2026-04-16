"""admin org_user 생성 + 로그인 재테스트"""
import paramiko, textwrap

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

FIX_SCRIPT = textwrap.dedent(r'''
import sqlite3
DB = "/opt/blossom/web/instance/dev_blossom.db"
conn = sqlite3.connect(DB)
c = conn.cursor()
c.execute("SELECT COUNT(*) FROM org_user WHERE emp_no=?", ("admin",))
if c.fetchone()[0] == 0:
    c.execute("""
        INSERT INTO org_user (emp_no, name, company, department, role, allowed_ip, employment_status)
        VALUES ('admin', '관리자', 'Blossom', '시스템관리', 'admin', '*', '재직')
    """)
    conn.commit()
    print("ORG_USER_CREATED")
else:
    c.execute("UPDATE org_user SET allowed_ip='*' WHERE emp_no='admin'")
    conn.commit()
    print("ORG_USER_UPDATED")
c.execute("SELECT emp_no, name, allowed_ip FROM org_user WHERE emp_no='admin'")
print("VERIFY:", c.fetchone())
conn.close()
''')

LOGIN_SCRIPT = textwrap.dedent(r'''
import requests, urllib3, re
urllib3.disable_warnings()
s = requests.Session()
r = s.get("https://127.0.0.1/login", verify=False)
r2 = s.post("https://127.0.0.1/login",
    data={"employee_id": "admin", "password": "admin1234!"},
    verify=False, allow_redirects=False)
print("POST:", r2.status_code, "Loc:", r2.headers.get("Location", ""))
if r2.status_code == 200:
    for line in r2.text.split("\n"):
        if "flash" in line.lower():
            clean = line.strip()[:200]
            if clean:
                print("FLASH:", clean)
''')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

sftp = ssh.open_sftp()

# Fix admin org_user
with sftp.open("/tmp/_fix_ip.py", "w") as f:
    f.write(FIX_SCRIPT)
sftp.close()

print("[1] Fixing admin org_user...")
_, o, e = ssh.exec_command("/opt/blossom/web/venv/bin/python3 /tmp/_fix_ip.py", timeout=10)
print(o.read().decode())
err = e.read().decode()
if err.strip(): print("ERR:", err)

# Login test
sftp = ssh.open_sftp()
with sftp.open("/tmp/_login_test.py", "w") as f:
    f.write(LOGIN_SCRIPT)
sftp.close()

print("[2] Login test...")
_, o, e = ssh.exec_command("/opt/blossom/web/venv/bin/python3 /tmp/_login_test.py", timeout=15)
print(o.read().decode())
err = e.read().decode()
if err.strip(): print("ERR:", err[-500:])

ssh.close()
