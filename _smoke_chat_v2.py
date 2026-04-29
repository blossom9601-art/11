#!/usr/bin/env python3
"""Smoke test: list channels, create channel, send message, read message, leave channel — end-to-end against v2 API on remote."""
import sys
sys.path.insert(0, '/opt/blossom/web')
from app import create_app
from datetime import datetime
import json

app = create_app()

def run(c, method, url, **kwargs):
    fn = getattr(c, method.lower())
    r = fn(url, **kwargs)
    body = r.get_json(silent=True)
    print(f'{method} {url} -> {r.status_code}', json.dumps(body, ensure_ascii=False)[:300] if body else r.data[:200])
    return r, body

with app.test_client() as c:
    now = datetime.utcnow().isoformat()
    with c.session_transaction() as s:
        s['user_id'] = 1
        s['emp_no'] = 'admin'
        s['role'] = 'ADMIN'
        s['_login_at'] = now
        s['_last_active'] = now

    print('--- list channels ---')
    r, b = run(c, 'GET', '/api/chat/v2/channels')

    print('--- create channel ---')
    r, b = run(c, 'POST', '/api/chat/v2/channels',
               json={'name': 'smoke-' + datetime.utcnow().strftime('%H%M%S'), 'type': 'public', 'description': 'smoke test'})
    ch = (b or {}).get('item') or (b or {}).get('channel') or b or {}
    cid = ch.get('id') or ch.get('channel_id') or ch.get('conversation_id')
    print('  channel_id:', cid)

    if cid:
        print('--- channel detail ---')
        run(c, 'GET', f'/api/chat/v2/channels/{cid}')

        print('--- send message ---')
        r, b = run(c, 'POST', '/api/chat/v2/messages',
                   json={'conversationId': cid, 'content': 'hello v2', 'type': 'TEXT'})
        msg = (b or {}).get('item') or b or {}
        mid = msg.get('id') or msg.get('message_id')
        print('  message_id:', mid)

        print('--- list messages ---')
        run(c, 'GET', f'/api/chat/v2/messages?conversationId={cid}&limit=20')

        if mid:
            print('--- mark read ---')
            run(c, 'POST', f'/api/chat/v2/messages/{mid}/read')

        print('--- leave ---')
        run(c, 'POST', f'/api/chat/v2/channels/{cid}/leave')

    print('--- final list ---')
    run(c, 'GET', '/api/chat/v2/channels')
