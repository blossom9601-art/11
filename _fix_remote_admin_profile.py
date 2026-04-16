import paramiko

host='192.168.56.108'
user='root'
pw='123456'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)

cmd = r"""cd /opt/blossom/web && /opt/blossom/web/venv/bin/python - <<'PY'
from app import create_app
from app.models import db, UserProfile

app = create_app()
with app.app_context():
    rows = UserProfile.query.all()
    target = None
    for row in rows:
        if (row.emp_no or '').lower() == 'admin':
            target = row
            break
    if not target:
        print('admin profile not found')
    else:
        before = {'id': target.id, 'emp_no': target.emp_no, 'name': target.name, 'department': target.department, 'profile_image': target.profile_image}
        target.department = '관리자'
        db.session.commit()
        after = {'id': target.id, 'emp_no': target.emp_no, 'name': target.name, 'department': target.department, 'profile_image': target.profile_image}
        print('before=', before)
        print('after=', after)
PY"""

_, so, se = ssh.exec_command(cmd, timeout=120)
out = so.read().decode('utf-8', 'ignore')
err = se.read().decode('utf-8', 'ignore').strip()
print(out or '(no stdout)')
print(err or '(no stderr)')
ssh.close()
