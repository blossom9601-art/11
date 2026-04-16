import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

def run(cmd, timeout=20):
    _, so, se = ssh.exec_command(cmd, timeout=timeout)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    return out + ('\n[STDERR:' + err + ']' if err else '')

# 1. Check correct nginx access log
print('=== blossom nginx access log: all /api/me/profile entries ===')
print(run('grep "api/me/profile" /var/log/blossom/web/blossom_access.log 2>/dev/null | tail -20 || echo "(no entries)"'))

print('\n=== blossom nginx access log: last 20 entries ===')
print(run('tail -20 /var/log/blossom/web/blossom_access.log 2>/dev/null || echo "(no log)"'))

# 2. Test POST /api/me/profile using venv python
print('\n=== Test via venv python: login + POST ===')
test_script = r"""
import sys
sys.path.insert(0, '/opt/blossom/web')
import os
os.chdir('/opt/blossom/web')

from app import create_app
from app.models import AuthUser, UserProfile
from datetime import datetime
import json

app = create_app()
with app.app_context():
    # Find first admin user
    admin = AuthUser.query.filter_by(role='ADMIN').first()
    if not admin:
        admin = AuthUser.query.first()
    if not admin:
        print('ERROR: No user found')
        sys.exit(1)
    print(f'Testing with user: emp_no={admin.emp_no} role={admin.role}')

    with app.test_client() as c:
        # Directly set session
        with c.session_transaction() as sess:
            sess['user_id'] = admin.id
            sess['emp_no'] = admin.emp_no
            sess['role'] = admin.role or 'ADMIN'
            sess['_login_at'] = datetime.utcnow().isoformat()
            sess['_last_active'] = datetime.utcnow().isoformat()

        # POST to /api/me/profile
        resp = c.post(
            '/api/me/profile',
            data=json.dumps({'profile_image': '/static/image/svg/profil/001-boy.svg'}),
            content_type='application/json',
            headers={'Accept': 'application/json'}
        )
        print(f'Status: {resp.status_code}')
        body = resp.data.decode('utf-8')
        print(f'Body: {body}')

        # Also test GET
        resp2 = c.get('/api/me/profile', headers={'Accept': 'application/json'})
        print(f'GET Status: {resp2.status_code}')
        print(f'GET Body: {resp2.data.decode("utf-8")[:200]}')
"""

print(run('/opt/blossom/web/venv/bin/python3 -c "' + test_script.replace('"', '\\"') + '" 2>&1', timeout=30))

# 3. Try via heredoc to avoid quoting issues
import tempfile, os
# Write script to remote
_, _, _ = ssh.exec_command('cat > /tmp/test_profile.py << \'PYEOF\'\n' + test_script.strip() + '\nPYEOF', timeout=5)
import time
time.sleep(1)

print('\n=== Test via heredoc venv python ===')
print(run('/opt/blossom/web/venv/bin/python3 /tmp/test_profile.py 2>&1', timeout=30))

ssh.close()
print('\nDone.')
