#!/usr/bin/env python3
"""cli_api.py 업데이트 & 검증."""
import paramiko, json, sys, time

sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

# cli_api.py 업데이트
with open("agents/web/cli_api.py", encoding="utf-8") as f:
    content = f.read()
sftp = c.open_sftp()
with sftp.file("/opt/blossom/lumina/web/app/cli_api.py", "w") as f:
    f.write(content)
sftp.close()

# CRLF -> LF
stdin, stdout, stderr = c.exec_command("sed -i 's/\\r$//' /opt/blossom/lumina/web/app/cli_api.py")
stdout.read()

# 재시작
stdin, stdout, stderr = c.exec_command("systemctl restart lumina-web")
stdout.read()
time.sleep(3)

# 확인
stdin, stdout, stderr = c.exec_command(
    'curl -sk -X POST https://127.0.0.1/api/cli/login '
    '-H "Content-Type: application/json" '
    '-d \'{"emp_no":"admin","password":"admin1234!"}\''
)
resp = json.loads(stdout.read().decode())
token = resp["token"]

stdin, stdout, stderr = c.exec_command(
    'curl -sk https://127.0.0.1/api/cli/agents '
    '-H "Authorization: Bearer %s"' % token
)
data = json.loads(stdout.read().decode())
for r in data["rows"]:
    print("  %s: approval=%s, approved_at=%s" % (
        r["hostname"], r["approval_status"], r.get("approved_at")))

c.close()
print("Done")
