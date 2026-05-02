import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("192.168.56.108", username="root", password="123456", timeout=15)
# Trigger request page to run init_web_access_control_tables
_, o, e = ssh.exec_command("curl -sk -o /dev/null -w '%{http_code}' -H 'X-Requested-With: blossom-spa' https://127.0.0.1/p/access_control_request")
print("HTTP status:", o.read().decode())
# Now check the DB
_, o2, _ = ssh.exec_command("python3 -c \"import sqlite3; conn=sqlite3.connect('/opt/blossom/web/instance/blossom.db'); cols=[r[1] for r in conn.execute('PRAGMA table_info(web_access_request)').fetchall()]; print('request_type_present', 'request_type' in cols); print('cols', cols)\"")
print(o2.read().decode())
ssh.close()
