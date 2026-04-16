import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmd = '''cd /opt/blossom/web && source venv/bin/activate 2>/dev/null || true && python3 -c "
from app import create_app
from app.models import AuthUser, db
app = create_app()
with app.app_context():
    u = AuthUser.query.filter_by(emp_no='admin').first()
    if u:
        u.set_password('admin')
        u.login_fail_cnt = 0
        u.locked_until = None
        db.session.commit()
        print('Password reset to admin, fail count cleared')
    else:
        print('No admin user found')
"'''

i, o, e = ssh.exec_command(cmd)
print('OUT:', o.read().decode()[-500:])
print('ERR:', e.read().decode()[-500:])
ssh.close()
