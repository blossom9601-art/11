import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

REMOTE_CMD = r"""
cd /opt/blossom/web
/opt/blossom/web/venv/bin/python - <<'PY'
from app import create_app
from app.models import db, AuthUser

app = create_app()
with app.app_context():
    users = AuthUser.query.filter(db.func.upper(AuthUser.emp_no) == 'ADMIN').all()

    # Fallback: if ADMIN emp_no is not present, unlock currently locked admin-role users.
    if not users:
        users = AuthUser.query.filter(AuthUser.role == 'admin').all()

    if not users:
        print('NO_USER_FOUND')
    else:
        changed = 0
        for u in users:
            before_cnt = u.login_fail_cnt
            before_locked = u.locked_until
            u.login_fail_cnt = 0
            u.locked_until = None
            u.status = 'active'
            changed += 1
            print(f'UNLOCKED emp_no={u.emp_no} role={u.role} before_fail={before_cnt} before_locked={before_locked}')
        db.session.commit()
        print(f'COMMIT_OK changed={changed}')
PY
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

_, so, se = ssh.exec_command(REMOTE_CMD, timeout=40)
out = so.read().decode('utf-8', 'ignore').strip()
err = se.read().decode('utf-8', 'ignore').strip()

print(out or '(no stdout)')
if err:
    print('[stderr]')
    print(err)

ssh.close()
