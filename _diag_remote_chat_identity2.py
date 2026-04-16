import paramiko

host='192.168.56.108'
user='root'
pw='123456'

ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)

cmd = r"""cd /opt/blossom/web && /opt/blossom/web/venv/bin/python - <<'PY'
from app import create_app
from app.models import UserProfile, AuthUser

app = create_app()
with app.app_context():
    print('=== AuthUser (emp_no like admin) ===')
    for u in AuthUser.query.all():
        if (u.emp_no or '').lower() == 'admin':
            print({'id': u.id, 'emp_no': u.emp_no, 'display_name': getattr(u, 'display_name', None), 'username': getattr(u, 'username', None)})

    print('=== UserProfile (emp_no like admin) ===')
    for p in UserProfile.query.all():
        if (p.emp_no or '').lower() == 'admin':
            print({'id': p.id, 'emp_no': p.emp_no, 'name': p.name, 'department': p.department, 'profile_image': p.profile_image})

    print('=== First 5 UserProfile rows ===')
    for p in UserProfile.query.order_by(UserProfile.id.asc()).limit(5).all():
        print({'id': p.id, 'emp_no': p.emp_no, 'name': p.name, 'department': p.department, 'profile_image': p.profile_image})
PY"""

_, so, se = ssh.exec_command(cmd, timeout=120)
out = so.read().decode('utf-8', 'ignore')
err = se.read().decode('utf-8', 'ignore').strip()
print(out or '(no stdout)')
print(err or '(no stderr)')
ssh.close()
