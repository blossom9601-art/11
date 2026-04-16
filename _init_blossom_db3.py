#!/usr/bin/env python3
"""Direct DB fix — create auth_users + admin via raw sqlite3."""
import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

def run(cmd, timeout=60):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    rc = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    mark = "OK" if rc == 0 else "FAIL"
    print(f"[{mark}] {cmd[:120]}")
    if out:
        for line in out.splitlines()[:30]:
            print(f"  {line}")
    if err and rc != 0:
        for line in err.splitlines()[:10]:
            print(f"  [err] {line}")
    return rc, out

DB = "/opt/blossom/web/instance/dev_blossom.db"
VENV_PY = "/opt/blossom/web/venv/bin/python"

# 1. Check current tables
print("=== 1. Current tables ===")
run(f"sqlite3 {DB} '.tables' 2>/dev/null || echo 'sqlite3 not found'")

# 2. Upload init script that does db.create_all and creates admin
SCRIPT = r"""
import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
os.environ['FLASK_ENV'] = 'development'

# Import models and db first
from app.models import db, AuthUser, AuthRole

# Create app (ignoring init_* errors which are non-fatal)
from app import create_app
app = create_app('development')

with app.app_context():
    # Force create all model tables
    db.create_all()
    print("db.create_all() done")

    # Check tables
    from sqlalchemy import inspect
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()
    print(f"Total tables: {len(tables)}")
    has_auth = 'auth_users' in tables
    print(f"auth_users: {'EXISTS' if has_auth else 'MISSING'}")

    if has_auth:
        # Create admin
        existing = AuthUser.query.filter_by(emp_no='admin').first()
        if existing:
            print(f"Admin already exists (id={existing.id})")
        else:
            admin = AuthUser(
                emp_no='admin',
                email='admin@blossom.local',
                role='admin',
                status='active'
            )
            admin.set_password('admin1234!')
            db.session.add(admin)
            db.session.commit()
            print("Admin created: admin / admin1234!")
        
        # Verify
        count = AuthUser.query.count()
        print(f"auth_users row count: {count}")
    
    print("INIT_OK")
"""

sftp = c.open_sftp()
with sftp.file("/tmp/blossom_dbinit.py", "w") as f:
    f.write(SCRIPT)
sftp.close()

print("\n=== 2. Run db.create_all + admin seed ===")
rc, out = run(f"{VENV_PY} /tmp/blossom_dbinit.py 2>&1 | tail -20", timeout=120)

if "INIT_OK" in (out or ""):
    print("\n  DB init successful!")
else:
    print("\n  DB init may have issues. Checking tables again...")
    run(f"sqlite3 {DB} '.tables' 2>/dev/null")

# 3. Restart
print("\n=== 3. Restart ===")
run("systemctl restart blossom-web")
time.sleep(3)
run("systemctl is-active blossom-web")

# 4. Login test - check with the correct form field names
print("\n=== 4. Login test ===")
# First, check login form field names
rc, out = run("curl -sk https://127.0.0.1:443/login 2>/dev/null | grep -oP 'name=\"[^\"]+\"' | head -10")

# POST login
rc, out = run("curl -sk -L -c /tmp/bl_jar -D /tmp/bl_hdr -X POST "
              "https://127.0.0.1:443/login -d 'emp_no=admin&password=admin1234!' "
              "-o /tmp/bl_body 2>/dev/null && head -3 /tmp/bl_hdr && echo '---' && head -5 /tmp/bl_body")

# Check final URL
rc, out = run("curl -sk -L -c /tmp/bl_jar2 -w '\\n%{url_effective}\\n%{http_code}' "
              "-X POST https://127.0.0.1:443/login -d 'emp_no=admin&password=admin1234!' "
              "-o /dev/null 2>/dev/null")

run("rm -f /tmp/blossom_dbinit.py /tmp/bl_jar /tmp/bl_jar2 /tmp/bl_hdr /tmp/bl_body")

c.close()
