"""QA: chat v2 channel creation + directory + page render."""
import sys, json
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
from datetime import datetime

app = create_app()
with app.test_client() as c:
    now = datetime.utcnow().isoformat()
    with c.session_transaction() as s:
        s['user_id'] = 1
        s['emp_no'] = 'admin'
        s['role'] = 'ADMIN'
        s['_login_at'] = now
        s['_last_active'] = now

    print("=== /addon/chat page ===")
    r = c.get('/addon/chat')
    print('status', r.status_code, 'len', len(r.data))
    html = r.data.decode('utf-8','replace')
    for marker in ['btn-new-channel', 'chat-new-channel-modal', 'member-picker-modal', 'mp-search', 'new-channel-dept-toggle']:
        print('  marker', marker, '=', marker in html)

    print("\n=== /api/chat/directory ===")
    r = c.get('/api/chat/directory', headers={'X-Requested-With':'XMLHttpRequest'})
    print('status', r.status_code)
    j = r.get_json(silent=True)
    if isinstance(j, list):
        print('count', len(j), 'sample', j[:2])
    else:
        print('payload', str(j)[:300])

    print("\n=== POST /api/chat/v2/channels (no members) ===")
    r = c.post('/api/chat/v2/channels',
               json={'name':'qa-test-' + datetime.utcnow().strftime('%H%M%S'),
                     'type':'public', 'memberIds':[]},
               headers={'X-Requested-With':'XMLHttpRequest'})
    print('status', r.status_code, 'body', r.data[:400].decode('utf-8','replace'))

    print("\n=== POST /api/chat/v2/channels (with member id 1) ===")
    r = c.post('/api/chat/v2/channels',
               json={'name':'qa-test-mem-' + datetime.utcnow().strftime('%H%M%S'),
                     'type':'private', 'memberIds':[1], 'description':'qa'},
               headers={'X-Requested-With':'XMLHttpRequest'})
    print('status', r.status_code, 'body', r.data[:400].decode('utf-8','replace'))

    print("\n=== GET /api/chat/v2/channels list ===")
    r = c.get('/api/chat/v2/channels', headers={'X-Requested-With':'XMLHttpRequest'})
    print('status', r.status_code)
    j = r.get_json(silent=True) or {}
    print('total', j.get('total'), 'len', len(j.get('rows',[]) if isinstance(j,dict) else j))
