#!/usr/bin/env python3
"""Remote DB init: upload a Python script to ttt3 and run it."""
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
    print(f"[{mark}] {cmd[:120]}")
    if out:
        for line in out.splitlines()[:30]:
            print(f"  {line}")
    if err and rc != 0:
        for line in err.splitlines()[:15]:
            print(f"  [err] {line}")
    return rc, out

# 1. Upload init script
INIT_SCRIPT = """
import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
os.environ['FLASK_ENV'] = 'development'

from app import create_app
from app.models import db

app = create_app('development')

with app.app_context():
    # Create all tables from SQLAlchemy models
    db.create_all()
    print("db.create_all() completed")

    # Verify auth_users exists
    import sqlite3
    conn = sqlite3.connect('instance/dev_blossom.db')
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    conn.close()
    print(f"Total tables: {len(tables)}")
    print(f"auth_users: {'EXISTS' if 'auth_users' in tables else 'MISSING'}")
    
    if 'auth_users' in tables:
        # Create admin user
        from app.models import AuthUser
        existing = AuthUser.query.filter_by(emp_no='admin').first()
        if existing:
            print("Admin user already exists")
        else:
            admin = AuthUser(emp_no='admin', email='admin@blossom.local', role='admin', status='active')
            admin.set_password('admin1234!')
            db.session.add(admin)
            db.session.commit()
            print("Admin user created: admin / admin1234!")
        
        # init-auth roles
        from app.models import AuthRole
        roles = [
            {'role': 'admin', 'description': 'System Admin', 'permissions': 'all'},
            {'role': 'user', 'description': 'Normal User', 'permissions': 'read'},
        ]
        for rd in roles:
            if not AuthRole.query.filter_by(role=rd['role']).first():
                db.session.add(AuthRole(**rd))
        db.session.commit()
        print("Auth roles initialized")
    else:
        print("ERROR: auth_users table still not created!")
        sys.exit(1)
"""

sftp = c.open_sftp()
with sftp.file("/tmp/init_blossom_db.py", "w") as f:
    f.write(INIT_SCRIPT)
sftp.close()

print("=== Running DB init on ttt3 ===")
rc, out = run("cd /opt/blossom/web && /opt/blossom/web/venv/bin/python /tmp/init_blossom_db.py 2>&1", timeout=120)

# 2. Restart service
print("\n=== Restarting blossom-web ===")
run("systemctl restart blossom-web")
time.sleep(3)
run("systemctl is-active blossom-web")

# 3. Test login POST
print("\n=== Test login ===")
rc, out = run("curl -sk -c /tmp/bl_cookie -D /tmp/bl_headers -X POST "
              "https://127.0.0.1:443/login -d 'emp_no=admin&password=admin1234!' 2>/dev/null "
              "&& cat /tmp/bl_headers | head -5")

# Check if redirected to dashboard (302)
rc, out = run("head -1 /tmp/bl_headers 2>/dev/null")
print(f"\nLogin result: {out}")

# Try accessing dashboard with cookie
rc, code = run("curl -sk -b /tmp/bl_cookie -o /dev/null -w '%{http_code}' https://127.0.0.1:443/dashboard")
print(f"Dashboard access: HTTP {code}")

run("rm -f /tmp/init_blossom_db.py /tmp/bl_cookie /tmp/bl_headers")

c.close()
