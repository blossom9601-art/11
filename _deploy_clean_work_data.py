import paramiko, os, textwrap

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
PYTHON = '/opt/blossom/web/venv/bin/python3.11'
REMOTE_BASE = '/opt/blossom/web'
LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()

# 1) Deploy updated service files
FILES = [
    'app/services/work_category_service.py',
    'app/services/work_division_service.py',
    'app/services/work_status_service.py',
    'app/services/work_operation_service.py',
    'app/services/work_group_service.py',
]
for f in FILES:
    lp = os.path.join(LOCAL_BASE, f)
    rp = f'{REMOTE_BASE}/{f}'
    sftp.put(lp, rp)
    print(f'  DEPLOY  {rp}')

# 2) Delete all data from all work tables on remote
cleanup_script = textwrap.dedent("""\
import sqlite3, os

base = "/opt/blossom/web/instance"
dbs = {
    "work_category.db": "biz_work_category",
    "work_division.db": "biz_work_division",
    "work_status.db": "biz_work_status",
    "work_operation.db": "biz_work_operation",
    "work_group.db": "biz_work_group",
}

# Clean individual DB files
for db_file, table in dbs.items():
    db_path = os.path.join(base, db_file)
    if not os.path.exists(db_path):
        print(f"  SKIP  {db_file} (not found)")
        continue
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute(f"DELETE FROM {table}")
        deleted = cur.rowcount
        # Reset autoincrement
        cur.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
        conn.commit()
        conn.close()
        print(f"  CLEAN  {db_file}: deleted {deleted} rows from {table}")
    except Exception as ex:
        print(f"  ERROR  {db_file}: {ex}")

# Clean dev_blossom.db work tables
for main_db in ["dev_blossom.db", "blossom.db"]:
    db_path = os.path.join(base, main_db)
    if not os.path.exists(db_path):
        continue
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        for table in dbs.values():
            try:
                cur.execute(f"DELETE FROM {table}")
                deleted = cur.rowcount
                if deleted > 0:
                    print(f"  CLEAN  {main_db}/{table}: deleted {deleted} rows")
                    cur.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
            except Exception:
                pass
        # Also clean related tables
        for extra in ["biz_work_group_change_log", "biz_work_group_manager", "biz_work_group_service"]:
            try:
                cur.execute(f"DELETE FROM {extra}")
                d = cur.rowcount
                if d > 0:
                    print(f"  CLEAN  {main_db}/{extra}: deleted {d} rows")
            except Exception:
                pass
        conn.commit()
        conn.close()
    except Exception as ex:
        print(f"  ERROR  {main_db}: {ex}")

print("  DB cleanup done")
""")

remote_script = '/tmp/_bls_cleanup_work.py'
with sftp.open(remote_script, 'w') as f:
    f.write(cleanup_script)

i, o, e = ssh.exec_command(f'{PYTHON} {remote_script}')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('STDERR:', err)

ssh.exec_command(f'rm -f {remote_script}')

# 3) Restart service
i, o, e = ssh.exec_command('systemctl restart blossom-web')
print('restart:', o.read().decode().strip() or 'OK')

sftp.close()
ssh.close()
print('Done.')
