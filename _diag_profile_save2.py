import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

def run(cmd, timeout=15):
    _, so, se = ssh.exec_command(cmd, timeout=timeout)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    return out + ('\n[STDERR]' + err if err else '')

print('=== nginx config: proxy_pass / location blocks ===')
print(run('cat /etc/nginx/sites-enabled/*.conf 2>/dev/null || cat /etc/nginx/conf.d/*.conf 2>/dev/null || cat /etc/nginx/nginx.conf | head -80'))

print('\n=== nginx access log format + recent entries ===')
print(run('tail -20 /var/log/nginx/access.log 2>/dev/null || echo "(no access log)"'))

print('\n=== gunicorn actual access logs ===')
print(run('journalctl -u blossom-web --no-pager -n 100 | grep -E "POST|GET|api/me" | tail -20'))

print('\n=== temp: add print to me_profile, check before deploy ===')
# Check the current emp_no logic in the route: does it handle session properly?
print(run('sed -n "4509,4545p" /opt/blossom/web/app/routes/api.py'))

print('\n=== check real user session: query auth_user table ===')
print(run(r"""python3 -c "
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
from app.models import AuthUser, UserProfile
app = create_app()
with app.app_context():
    users = AuthUser.query.limit(5).all()
    for u in users:
        print('User:', u.emp_no, 'email:', u.email, 'role:', u.role, 'id:', u.id)
    profiles = UserProfile.query.limit(5).all()
    for p in profiles:
        print('Profile:', p.emp_no, 'img:', p.profile_image)
" 2>&1"""))

print('\n=== Run a real POST with proper session via python test client ===')
print(run(r"""python3 -c "
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
with app.test_client() as c:
    from flask import session
    from app.models import AuthUser
    with app.app_context():
        # Get first admin user
        admin = AuthUser.query.filter_by(role='ADMIN').first()
        if not admin:
            admin = AuthUser.query.first()
        print('Testing with user:', admin.emp_no if admin else 'NONE')
    if admin:
        with c.session_transaction() as sess:
            sess['user_id'] = admin.id
            sess['emp_no'] = admin.emp_no
            sess['role'] = 'ADMIN'
            from datetime import datetime
            sess['_login_at'] = datetime.utcnow().isoformat()
            sess['_last_active'] = datetime.utcnow().isoformat()
        import json
        resp = c.post('/api/me/profile',
            data=json.dumps({'profile_image': '/static/image/svg/profil/001-boy.svg'}),
            content_type='application/json')
        print('Status:', resp.status_code)
        print('Body:', resp.data.decode('utf-8'))
" 2>&1"""))

ssh.close()
print('\nDone.')
