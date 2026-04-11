#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
cd /opt/blossom/lumina/web
export FLASK_APP=run
export PYTHONPATH=/opt/blossom/lumina/web
# Source the env file
set -a; source /etc/blossom/lumina/web.env 2>/dev/null; set +a

python3.9 << 'PYEOF'
import sys, os
sys.path.insert(0, '.')

from app import create_app
app = create_app()

with app.app_context():
    from app.models import AuthUser, UserProfile, db
    
    # 1. Check admin user in auth_users
    user = AuthUser.query.filter_by(emp_no='admin').first()
    if not user:
        print("[FAIL] admin user NOT FOUND in auth_users")
        all_users = AuthUser.query.all()
        print(f"  All users: {[(u.emp_no, u.status) for u in all_users]}")
    else:
        print(f"[OK] admin user found: id={user.id}, emp_no={user.emp_no}")
        print(f"  status  = '{user.status}'")
        print(f"  role    = '{user.role}'")
        print(f"  email   = '{user.email}'")
        print(f"  login_fail_cnt  = {user.login_fail_cnt}")
        print(f"  locked_until    = {user.locked_until}")
        print(f"  password_hash   = {user.password_hash[:60]}...")
        print(f"  last_terms_accepted_at = {user.last_terms_accepted_at}")
        
        # 2. Test password check
        pwd_ok = user.check_password('admin1234!')
        print(f"\n[PWD] check_password('admin1234!') = {pwd_ok}")
        pwd_wrong = user.check_password('wrongpass')
        print(f"[PWD] check_password('wrongpass')  = {pwd_wrong}")
        
        # 3. Check is_locked
        print(f"[LOCK] is_locked() = {user.is_locked()}")
        
        # 4. Check needs_terms
        print(f"[TERMS] needs_terms() = {user.needs_terms()}")
    
    # 5. Check UserProfile
    profile = UserProfile.query.filter_by(emp_no='admin').first()
    if profile:
        print(f"\n[PROFILE] found: id={profile.id}, allowed_ip='{profile.allowed_ip}'")
    else:
        print(f"\n[PROFILE] NOT FOUND for admin")
    
    # 6. Live login test with test_client (no redirect follow)
    print("\n=== LOGIN TEST (test_client) ===")
    with app.test_client() as c:
        resp = c.post('/login', data={
            'employee_id': 'admin',
            'password': 'admin1234!'
        }, follow_redirects=False)
        print(f"[CORRECT PWD] status={resp.status_code}")
        print(f"  Location: {resp.headers.get('Location', 'NONE')}")
        with c.session_transaction() as sess:
            flashes = sess.get('_flashes', [])
            print(f"  Flashes: {flashes}")
            print(f"  Session keys: {list(sess.keys())}")
            print(f"  user_id: {sess.get('user_id')}")
            print(f"  emp_no: {sess.get('emp_no')}")
            
    # 7. Test with wrong password
    with app.test_client() as c:
        resp = c.post('/login', data={
            'employee_id': 'admin',
            'password': 'wrongpass'
        }, follow_redirects=False)
        print(f"\n[WRONG PWD] status={resp.status_code}")
        print(f"  Location: {resp.headers.get('Location', 'NONE')}")
        with c.session_transaction() as sess:
            flashes = sess.get('_flashes', [])
            print(f"  Flashes: {flashes}")

    # 8. Check journalctl for recent errors
    print("\n=== RECENT JOURNAL ERRORS ===")
    import subprocess
    result = subprocess.run(['journalctl', '-u', 'lumina-web', '--since', '5 min ago', '--no-pager', '-q'], 
                          capture_output=True, text=True)
    for line in result.stdout.split('\n'):
        if 'error' in line.lower() or 'traceback' in line.lower() or 'exception' in line.lower() or 'login' in line.lower():
            print(f"  {line.strip()}")
PYEOF
REMOTE
