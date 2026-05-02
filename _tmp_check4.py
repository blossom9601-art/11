import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("192.168.56.108", username="root", password="123456", timeout=15)
_, o, _ = ssh.exec_command("python3 -c \"import sqlite3; conn=sqlite3.connect('/opt/blossom/web/instance/blossom.db'); tables=[r[0] for r in conn.execute(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\").fetchall()]; print(tables)\"")
print(o.read().decode())
ssh.close()
