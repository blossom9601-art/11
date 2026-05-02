import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("192.168.56.108", username="root", password="123456", timeout=15)
_, o, _ = ssh.exec_command("which python3 || find /opt/blossom -name python3 -type f 2>/dev/null | head -3")
print("python3 path:", o.read().decode())
_, o2, _ = ssh.exec_command("python3 -c \"import sqlite3; conn=sqlite3.connect('/opt/blossom/web/instance/blossom.db'); cols=[r[1] for r in conn.execute('PRAGMA table_info(web_access_request)').fetchall()]; print(cols)\"")
print("cols:", o2.read().decode())
ssh.close()
