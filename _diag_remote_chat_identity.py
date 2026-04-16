import paramiko

host='192.168.56.108'
user='root'
pw='123456'

py = r'''
from app import create_app
from app.models import UserProfile, AuthUser

app = create_app()
with app.app_context():
    print('=== AuthUser (emp_no like admin) ===')
    users = AuthUser.query.all()
    for u in users:
        if (u.emp_no or '').lower() == 'admin':
            print({'id': u.id, 'emp_no': u.emp_no, 'name': u.name, 'profile_image': getattr(u, 'profile_image', None)})

    print('=== UserProfile (emp_no like admin) ===')
    profiles = UserProfile.query.all()
    for p in profiles:
        if (p.emp_no or '').lower() == 'admin':
            print({'id': p.id, 'emp_no': p.emp_no, 'name': p.name, 'department': p.department, 'profile_image': p.profile_image})

    print('=== First 5 UserProfile rows ===')
    for p in UserProfile.query.order_by(UserProfile.id.asc()).limit(5).all():
        print({'id': p.id, 'emp_no': p.emp_no, 'name': p.name, 'department': p.department, 'profile_image': p.profile_image})
'''

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)
cmd = "cd /opt/blossom/web && /opt/blossom/web/venv/bin/python -c \"{}\"".format(py.replace('"', '\\"').replace('\n', '; '))
_, so, se = ssh.exec_command(cmd, timeout=120)
out = so.read().decode('utf-8', 'ignore')
err = se.read().decode('utf-8', 'ignore')
print(out)
if err.strip():
    print('ERR:', err)
ssh.close()
