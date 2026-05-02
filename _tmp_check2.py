import paramiko, sys
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("192.168.56.108", username="root", password="123456", timeout=15)

# python3 one-liner with the venv
cmd = (
    "cd /opt/blossom/web && .venv/bin/python3 -c \""
    "import sqlite3; "
    "conn = sqlite3.connect('/opt/blossom/web/instance/blossom.db'); "
    "cols = [r[1] for r in conn.execute(\\\"PRAGMA table_info(web_access_request)\\\").fetchall()]; "
    "print('cols:', cols); "
    "print('request_type_present:', 'request_type' in cols)"
    "\""
)
_, out, err = ssh.exec_command(cmd)
print(out.read().decode("utf-8", "replace"))
print(err.read().decode("utf-8", "replace"))
ssh.close()
