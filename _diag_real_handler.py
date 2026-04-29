import os, sys, traceback, json
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
from app import create_app
app = create_app()
from datetime import datetime
with app.test_client() as c:
    # Use real session from cookie? We don't have it. Try emp_no='admin'
    with c.session_transaction() as s:
        s['user_id'] = 1
        s['emp_no'] = 'admin'
        s['role'] = 'ADMIN'
        s['_login_at'] = datetime.utcnow().isoformat()
        s['_last_active'] = datetime.utcnow().isoformat()
    r = c.post('/api/chat/v2/channels',
               json={'name':'diag-real-test-' + str(int(datetime.utcnow().timestamp())), 'type':'public'},
               headers={'X-Requested-With':'XMLHttpRequest'})
    print('status:', r.status_code)
    print('body:', r.get_data(as_text=True)[:600])

# Now try lookup of all UserProfile entries to see which user maps to actual user
print('---')
with app.app_context():
    from app.models import UserProfile, db
    rows = db.session.query(UserProfile.id, UserProfile.emp_no, UserProfile.name, UserProfile.role).limit(15).all()
    for r in rows:
        print(r)
