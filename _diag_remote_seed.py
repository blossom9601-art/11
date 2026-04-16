import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check if seed code still exists
cmds = [
    ("status seed", "grep -c '가동' /opt/blossom/web/app/services/work_status_service.py"),
    ("status INSERT", "grep -c 'INSERT OR IGNORE' /opt/blossom/web/app/services/work_status_service.py"),
    ("group fk_seed", "grep 'ensure_work_group_fk_seed' /opt/blossom/web/app/services/work_group_service.py"),
    ("group INSERT_status", "grep 'INSERT OR IGNORE INTO biz_work_status' /opt/blossom/web/app/services/work_group_service.py"),
]

for label, cmd in cmds:
    i,o,e = ssh.exec_command(cmd + " 2>&1")
    print(f'{label}: {o.read().decode().strip()}')

# Check which tables have data
PYTHON = '/opt/blossom/web/venv/bin/python3.11'
check = """
import sqlite3, os
base = "/opt/blossom/web/instance"
for db_file, table in [("work_status.db","biz_work_status"),("work_division.db","biz_work_division")]:
    db_path = os.path.join(base, db_file)
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM {table}")
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description]
        print(f"{db_file}: {len(rows)} rows")
        for r in rows:
            d = dict(zip(cols, r))
            print(f"  {d}")
        conn.close()
"""
remote_script = '/tmp/_bls_check.py'
sftp = ssh.open_sftp()
with sftp.open(remote_script, 'w') as f:
    f.write(check)
sftp.close()

i,o,e = ssh.exec_command(f'{PYTHON} {remote_script}')
print(o.read().decode())
ssh.exec_command(f'rm -f {remote_script}')
ssh.close()
