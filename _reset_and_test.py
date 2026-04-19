"""Reset admin password and fail count on server, then test full flow"""
import paramiko, json, time
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Reset admin password to 'admin1234!' and clear fail count
print('=== Resetting admin password ===')
_, o, e = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.app_context():
    from app.models import AuthUser
    from app import db
    u = AuthUser.query.filter_by(emp_no='admin').first()
    u.set_password('admin1234!')
    u.login_fail_cnt = 0
    u.locked_until = None
    db.session.commit()
    # Verify
    print('verify:', u.check_password('admin1234!'))
    print('fail_cnt:', u.login_fail_cnt)
" 2>&1 | tail -5""",
    timeout=20
)
print(o.read().decode().strip())

# 2. Test login with new password via test_client + search
print('\n=== Test login + search ===')
_, o, e = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sys, json
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.test_client() as c:
    rv = c.post('/login', data={'employee_id': 'admin', 'password': 'admin1234!'}, follow_redirects=True)
    html = rv.data.decode('utf-8', errors='replace')
    if '대시보드' in html or 'dashboard' in html.lower():
        print('login: SUCCESS')
    else:
        print('login: FAILED')
        import re
        errs = re.findall(r'flash[^>]*>(.*?)</div', html, re.DOTALL)
        for e2 in errs[:3]:
            print('flash:', e2.strip()[:200])
    
    # Quick search (no LLM, just check auth works)
    rv2 = c.post('/api/search/unified', json={'q': 'test', 'limit': 5},
                 headers={'X-Requested-With': 'XMLHttpRequest'})
    d = rv2.get_json()
    print(f'search: status={rv2.status_code} success={d.get(\"success\")} total={d.get(\"total\",0)}')
" 2>&1 | grep -E '^(login|search|flash)'""",
    timeout=30
)
print(o.read().decode().strip())

# 3. Test curl login with new password
print('\n=== Test curl login ===')
_, o, _ = ssh.exec_command(
    'curl -sv -c /tmp/bc3.txt -X POST http://localhost:8001/login '
    '-d "employee_id=admin&password=admin1234!" '
    '-H "Content-Type: application/x-www-form-urlencoded" '
    '-o /dev/null 2>&1 | grep -iE "set-cookie|< HTTP|location"',
    timeout=10
)
print(o.read().decode().strip())

# 4. Test curl search with session
_, o, _ = ssh.exec_command(
    "curl -s -b /tmp/bc3.txt -X POST http://localhost:8001/api/search/unified "
    "-H 'Content-Type: application/json' "
    "-H 'X-Requested-With: XMLHttpRequest' "
    """-d '{"q":"AI","limit":5}' """
    '-w "\nHTTP:%{http_code}"',
    timeout=15
)
resp = o.read().decode().strip()
print('\nCurl search:', resp[:300])

ssh.close()
print('\n[DONE]')
