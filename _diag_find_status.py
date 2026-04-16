import paramiko, textwrap
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

PYTHON = '/opt/blossom/web/venv/bin/python3.11'

script = textwrap.dedent("""\
import sqlite3, os, glob

base = "/opt/blossom/web/instance"
# Find ALL .db files that contain biz_work_status table
for db_path in glob.glob(os.path.join(base, "*.db")):
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='biz_work_status'")
        if cur.fetchone():
            cur.execute("SELECT COUNT(*) FROM biz_work_status")
            cnt = cur.fetchone()[0]
            if cnt > 0:
                print(f"FOUND {cnt} rows in {db_path}")
                cur.execute("SELECT * FROM biz_work_status")
                cols = [d[0] for d in cur.description]
                for row in cur.fetchall():
                    print(f"  {dict(zip(cols, row))}")
        conn.close()
    except Exception as ex:
        pass

# Also check the main dev_blossom.db at project root
for p in ["/opt/blossom/web/dev_blossom.db"]:
    if os.path.exists(p):
        try:
            conn = sqlite3.connect(p)
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='biz_work_status'")
            if cur.fetchone():
                cur.execute("SELECT COUNT(*) FROM biz_work_status")
                cnt = cur.fetchone()[0]
                if cnt > 0:
                    print(f"FOUND {cnt} rows in {p}")
            conn.close()
        except:
            pass
""")

remote_script = '/tmp/_bls_find_status.py'
sftp = ssh.open_sftp()
with sftp.open(remote_script, 'w') as f:
    f.write(script)
sftp.close()

i,o,e = ssh.exec_command(f'{PYTHON} {remote_script}')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('STDERR:', err)

ssh.exec_command(f'rm -f {remote_script}')
ssh.close()
