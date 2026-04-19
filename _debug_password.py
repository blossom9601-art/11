"""Detailed login debug - find error message and check password"""
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Check admin's password hash and try to verify
_, o, _ = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.app_context():
    from app.models import AuthUser
    u = AuthUser.query.filter_by(emp_no='admin').first()
    print('hash_prefix:', u.password_hash[:30] if u.password_hash else 'NONE')
    print('check admin:', u.check_password('admin'))
    print('check 123456:', u.check_password('123456'))
    print('check password:', u.check_password('password'))
    print('fail_cnt:', u.login_fail_cnt)
    print('locked_until:', u.locked_until)
" 2>&1 | tail -10""",
    timeout=20
)
print(o.read().decode().strip())

# 2. Full login response HTML (just the body with errors)
_, o, _ = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sys, re
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.test_client() as c:
    rv = c.post('/login', data={'employee_id': 'admin', 'password': 'admin'}, follow_redirects=True)
    html = rv.data.decode('utf-8', errors='replace')
    # Find any error/alert/flash content
    for pattern in [r'alert[^>]*>(.*?)</div', r'error[^>]*>(.*?)</[a-z]', r'flash[^>]*>(.*?)</[a-z]', r'message[^>]*>(.*?)</[a-z]', r'<p class=\"text-danger\">(.*?)</p>']:
        matches = re.findall(pattern, html, re.DOTALL | re.IGNORECASE)
        for m in matches[:3]:
            t = m.strip()[:200]
            if t:
                print(f'MATCH[{pattern[:20]}]: {t}')
" 2>&1 | grep MATCH""",
    timeout=20
)
print('\nHTML matches:')
print(o.read().decode().strip())

ssh.close()
