"""Diagnose: verify chat.html (SPA fetch) actually contains script and chat-config inside main."""
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
from datetime import datetime

app = create_app()
with app.test_client() as c:
    now = datetime.utcnow().isoformat()
    with c.session_transaction() as s:
        s['user_id'] = 2
        s['emp_no'] = '20184037'
        s['role'] = 'USER'
        s['_login_at'] = now
        s['_last_active'] = now
    # SPA fetch with X-Requested-With
    r = c.get('/addon/chat', headers={'X-Requested-With': 'blossom-spa'})
    body = r.get_data(as_text=True)
    print('STATUS:', r.status_code, 'LEN:', len(body))
    # Find key markers
    print('has chat-config:', 'id="chat-config"' in body)
    print('has 3.chat.js script:', '3.chat.js' in body)
    print('has main.main-content:', 'main class="main-content"' in body)
    # Locate positions
    p_main_open = body.find('<main class="main-content"')
    p_main_close = body.find('</main>')
    p_cfg = body.find('id="chat-config"')
    p_script = body.find('3.chat.js')
    print('positions: main_open=%d main_close=%d cfg=%d script=%d' % (p_main_open, p_main_close, p_cfg, p_script))
    print('cfg inside main:', p_main_open < p_cfg < p_main_close)
    print('script inside main:', p_main_open < p_script < p_main_close)
    # Now whoami
    r2 = c.get('/api/chat/v2/whoami')
    print('whoami status:', r2.status_code, 'body:', r2.get_data(as_text=True)[:200])
    # List
    r3 = c.get('/api/chat/v2/conversations')
    print('list status:', r3.status_code)
    j = r3.get_json(silent=True) or {}
    print('list keys:', list(j.keys()))
    print('list total:', j.get('total'), 'rows:', len(j.get('rows', [])))
    if j.get('rows'):
        print('first row keys:', list(j['rows'][0].keys())[:10])
        print('first row name:', j['rows'][0].get('name'))
