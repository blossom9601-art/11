"""Server-side login test - check what error occurs"""
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Test login via test_client to see flash messages
_, o, e = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.test_client() as c:
    # Try login
    rv = c.post('/login', data={'employee_id': 'admin', 'password': 'admin'}, follow_redirects=True)
    print('status:', rv.status_code)
    html = rv.data.decode('utf-8', errors='replace')
    # Check for flash error messages
    import re
    flashes = re.findall(r'flash-message[^>]*>([^<]+)', html)
    if flashes:
        print('flash:', flashes)
    # Check if we landed on dashboard or login
    if '/dashboard' in html or 'Dashboard' in html or '대시보드' in html:
        print('result: DASHBOARD (login success)')
    elif 'sign-in' in html or 'employee_id' in html or '로그인' in html:
        print('result: LOGIN PAGE (login failed)')
        # Extract error
        errs = re.findall(r'alert[^>]*>(.*?)</div', html, re.DOTALL)
        for e2 in errs[:3]:
            print('alert:', e2.strip()[:200])
    else:
        print('result: UNKNOWN')
        print('title:', re.findall(r'<title>(.*?)</title>', html)[:1])
    
    # Also try API search with this session
    rv2 = c.post('/api/search/unified', json={'q': 'AI', 'limit': 5})
    print('search status:', rv2.status_code)
    d = rv2.get_json()
    print('search success:', d.get('success'))
    print('search method:', d.get('method', 'N/A'))
    print('search total:', d.get('total', 0))
" 2>&1 | grep -E '^(status|result|flash|alert|search|title)' """,
    timeout=60
)
print(o.read().decode().strip())
err = e.read().decode().strip()
if err:
    print('STDERR:', err[-300:])

ssh.close()
