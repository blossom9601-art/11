#!/usr/bin/env python3
"""Initialize Blossom DB on ttt3 — run flask db upgrade + create-admin."""
import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

def run(cmd, timeout=120):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    rc = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    mark = "OK" if rc == 0 else "FAIL"
    print(f"[{mark}] {cmd[:100]}")
    if out:
        for line in out.splitlines()[:25]:
            print(f"  {line}")
    if err:
        for line in err.splitlines()[:15]:
            print(f"  [err] {line}")
    return rc, out

VENV = "/opt/blossom/web/venv/bin"
APP_DIR = "/opt/blossom/web"

# 1. Copy migrations folder (needed for flask db upgrade)
print("=== 1. Upload migrations folder ===")
import os, tarfile, io

tar_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_migrations.tar.gz")
migrations_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations")

with tarfile.open(tar_path, "w:gz") as tar:
    tar.add(migrations_dir, arcname="migrations")

sftp = c.open_sftp()
sftp.put(tar_path, "/tmp/_migrations.tar.gz")
sftp.close()

run(f"/usr/bin/tar xzf /tmp/_migrations.tar.gz -C {APP_DIR}")
run(f"rm -f /tmp/_migrations.tar.gz")
os.remove(tar_path)
print("  migrations/ uploaded")

# 2. Flask DB upgrade
print("\n=== 2. flask db upgrade ===")
env = f"cd {APP_DIR} && FLASK_APP=wsgi:application {VENV}/flask db upgrade 2>&1"
rc, out = run(env, timeout=120)

if rc != 0:
    # Maybe migrations don't cover all tables; try db.create_all as fallback
    print("\n=== 2b. Fallback: db.create_all() ===")
    run(f"cd {APP_DIR} && {VENV}/python -c \""
        "import sys; sys.path.insert(0,'.'); "
        "from app import create_app; "
        "from app.models import db; "
        "app = create_app('development'); "
        "with app.app_context(): db.create_all(); "
        "print('db.create_all() OK')\" 2>&1")

# 3. Verify auth_users table exists
print("\n=== 3. Verify auth_users table ===")
rc, out = run(f"cd {APP_DIR} && {VENV}/python -c \""
              "import sqlite3; "
              "conn = sqlite3.connect('instance/dev_blossom.db'); "
              "tables = [r[0] for r in conn.execute(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\").fetchall()]; "
              "print(f'Total tables: {{len(tables)}}'); "
              "print('auth_users:', 'EXISTS' if 'auth_users' in tables else 'MISSING'); "
              "conn.close()\" 2>&1")

# 4. init-auth (create roles)
print("\n=== 4. flask init-auth ===")
run(f"cd {APP_DIR} && FLASK_APP=wsgi:application {VENV}/flask init-auth 2>&1")

# 5. create-admin
print("\n=== 5. flask create-admin ===")
run(f"cd {APP_DIR} && FLASK_APP=wsgi:application {VENV}/flask create-admin --emp-no admin --password 'admin1234!' 2>&1")

# 6. Restart service
print("\n=== 6. Restart blossom-web ===")
run("systemctl restart blossom-web")
time.sleep(3)
run("systemctl is-active blossom-web")

# 7. Test login
print("\n=== 7. Test login ===")
rc, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:443/login")
print(f"  GET /login → HTTP {code}")

# Test POST login
rc, out = run("curl -sk -D- -X POST https://127.0.0.1:443/login "
              "-d 'emp_no=admin&password=admin1234!' 2>/dev/null | head -10")

print("\n=== Done ===")

c.close()
