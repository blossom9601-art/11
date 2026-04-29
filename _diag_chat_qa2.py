"""QA: chat v2 — SPA fetch."""
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
from datetime import datetime

app = create_app()
with app.test_client() as c:
    now = datetime.utcnow().isoformat()
    with c.session_transaction() as s:
        s['user_id'] = 1; s['emp_no'] = 'admin'; s['role'] = 'ADMIN'
        s['_login_at'] = now; s['_last_active'] = now

    print("=== /addon/chat (SPA) ===")
    r = c.get('/addon/chat', headers={'X-Requested-With': 'blossom-spa'})
    print('status', r.status_code, 'len', len(r.data))
    html = r.data.decode('utf-8', 'replace')
    for marker in ['btn-new-channel','chat-new-channel-modal','member-picker-modal',
                   'mp-search','new-channel-dept-toggle','member-picker-apply',
                   'mp-tree','mp-list']:
        print('  marker', marker, '=', marker in html)
