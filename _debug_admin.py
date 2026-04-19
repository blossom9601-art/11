"""Admin 사용자 확인 + 로그인 디버깅"""
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check admin user
_, o, _ = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.app_context():
    from app.models import AuthUser
    users = AuthUser.query.limit(5).all()
    for u in users:
        print(f'emp_no={u.emp_no} status={u.status} role={getattr(u, \"role\", \"?\")} name={getattr(u, \"name\", \"?\")}')
" """,
    timeout=20
)
print('Users:', o.read().decode().strip())
_, e, _ = ssh.exec_command('')
# Check stderr
_, o, e2 = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.app_context():
    from app.models import AuthUser
    users = AuthUser.query.limit(5).all()
    for u in users:
        print(f'emp_no={u.emp_no} status={u.status}')
" """ ,
    timeout=20
)
print('Users:', o.read().decode().strip())
err = e2.read().decode().strip()
if err:
    print('Errors:', err[-300:])

# Check CSRF - does login page have csrf_token?
_, o, _ = ssh.exec_command(
    'curl -s http://localhost:8001/login | grep -i csrf',
    timeout=5
)
csrf = o.read().decode().strip()
print(f'\nCSRF in login page: {"YES" if csrf else "NO"}')
if csrf:
    print(csrf[:200])

ssh.close()
