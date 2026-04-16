#!/usr/bin/env python3
"""Deploy software_asset_service.py, clean re-seeded work status rows, restart, verify."""
import paramiko, os, json

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"
REMOTE_BASE = "/opt/blossom/web"
LOCAL_BASE = r"C:\Users\ME\Desktop\blossom"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()

# 1. Deploy software_asset_service.py
local_file = os.path.join(LOCAL_BASE, "app", "services", "software_asset_service.py")
remote_file = f"{REMOTE_BASE}/app/services/software_asset_service.py"
print(f"[1/4] Uploading {remote_file} ...")
sftp.put(local_file, remote_file)
print("      Done.")

# 2. Clean re-seeded rows from dev_blossom.db
clean_script = """
import sqlite3, os
db_path = '/opt/blossom/web/instance/dev_blossom.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    # Check current rows
    try:
        c.execute("SELECT * FROM biz_work_status")
        rows = c.fetchall()
        print(f"  biz_work_status before: {len(rows)} rows: {rows}")
        if rows:
            c.execute("DELETE FROM biz_work_status")
            conn.commit()
            print(f"  Deleted {len(rows)} rows from biz_work_status")
    except Exception as e:
        print(f"  biz_work_status error: {e}")
    
    # Also verify other tables are still clean
    for tbl in ['biz_work_division', 'biz_work_category', 'biz_work_operation', 'biz_work_group']:
        try:
            c.execute(f"SELECT COUNT(*) FROM {tbl}")
            cnt = c.fetchone()[0]
            print(f"  {tbl}: {cnt} rows")
        except Exception as e:
            print(f"  {tbl}: {e}")
    conn.close()
else:
    print(f"  {db_path} not found")

# Also check work_status.db
db2 = '/opt/blossom/web/instance/work_status.db'
if os.path.exists(db2):
    conn2 = sqlite3.connect(db2)
    c2 = conn2.cursor()
    try:
        c2.execute("SELECT * FROM biz_work_status")
        rows2 = c2.fetchall()
        print(f"  work_status.db before: {len(rows2)} rows: {rows2}")
        if rows2:
            c2.execute("DELETE FROM biz_work_status")
            conn2.commit()
            print(f"  Deleted {len(rows2)} rows from work_status.db")
    except Exception as e:
        print(f"  work_status.db error: {e}")
    conn2.close()
"""
print("\n[2/4] Cleaning re-seeded work status rows ...")
stdin, stdout, stderr = ssh.exec_command(
    f'{REMOTE_BASE}/venv/bin/python3.11 -c """{clean_script}"""'
)
# Use a temp file approach instead (safer for multiline)
sftp.open(f"{REMOTE_BASE}/_tmp_clean.py", "w").write(clean_script)
stdin, stdout, stderr = ssh.exec_command(
    f"{REMOTE_BASE}/venv/bin/python3.11 {REMOTE_BASE}/_tmp_clean.py"
)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print(f"  STDERR: {err}")

# 3. Restart blossom-web
print("[3/4] Restarting blossom-web ...")
stdin, stdout, stderr = ssh.exec_command("systemctl restart blossom-web")
exit_code = stdout.channel.recv_exit_status()
print(f"      Restart exit code: {exit_code}")

# 4. Verify APIs
import time
time.sleep(3)
print("\n[4/4] Verifying work APIs ...")
verify_script = """
import urllib.request, json, ssl
ctx = ssl._create_unverified_context()
apis = [
    'work-categories', 'work-divisions', 'work-statuses',
    'work-operations', 'work-groups'
]
for api in apis:
    url = f'https://127.0.0.1/api/{api}'
    try:
        req = urllib.request.Request(url)
        req.add_header('Cookie', 'session=dummy')
        resp = urllib.request.urlopen(req, context=ctx, timeout=5)
        data = json.loads(resp.read())
        total = data.get('total', len(data.get('rows', [])))
        print(f'  {api}: {total} items')
    except Exception as e:
        # Try without auth - just check total
        try:
            resp = urllib.request.urlopen(url, context=ctx, timeout=5)
            data = json.loads(resp.read())
            total = data.get('total', len(data.get('rows', [])))
            print(f'  {api}: {total} items')
        except Exception as e2:
            print(f'  {api}: ERROR - {e2}')
"""
sftp.open(f"{REMOTE_BASE}/_tmp_verify.py", "w").write(verify_script)
stdin, stdout, stderr = ssh.exec_command(
    f"{REMOTE_BASE}/venv/bin/python3.11 {REMOTE_BASE}/_tmp_verify.py"
)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print(f"  STDERR: {err}")

# Cleanup temp files
try:
    sftp.remove(f"{REMOTE_BASE}/_tmp_clean.py")
    sftp.remove(f"{REMOTE_BASE}/_tmp_verify.py")
except:
    pass

sftp.close()
ssh.close()
print("\nAll done!")
