"""Check admin allowed_ip and fix login for curl testing"""
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check login debug log
_, o, _ = ssh.exec_command('tail -20 /opt/blossom/web/instance/login_debug.log 2>/dev/null')
print('Login debug log:')
print(o.read().decode().strip())

# Check admin profile allowed_ip
_, o, _ = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sys, sqlite3
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.app_context():
    from app.models import UserProfile, AuthUser
    u = AuthUser.query.filter_by(emp_no='admin').first()
    p = UserProfile.query.filter_by(emp_no='admin').first()
    print(f'User: emp_no={u.emp_no} status={u.status}')
    if p:
        print(f'Profile: allowed_ip=[{p.allowed_ip}]')
    else:
        print('Profile: NOT FOUND')
" 2>&1 | tail -5""",
    timeout=20
)
print('\nAdmin info:')
print(o.read().decode().strip())

ssh.close()
