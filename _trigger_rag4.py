import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

script = """
import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')

from app import create_app
app = create_app()
with app.test_client() as c:
    with c.session_transaction() as sess:
        sess['user_id'] = 1
        sess['emp_no'] = 'admin'

    # Try various endpoints
    urls = [
        '/api/insight/items?limit=3',
        '/api/insight/items?category=technical&limit=3',
        '/api/insight/items?category=trend&limit=3',
    ]
    for url in urls:
        resp = c.get(url)
        print('GET {} -> status={}'.format(url, resp.status_code))
        raw = resp.get_data(as_text=True)[:300]
        print('  body:', raw[:300])
        print()

    # Direct GET item id=7 (from the log we saw tech:7)
    resp2 = c.get('/api/insight/items/7')
    print('GET /api/insight/items/7 -> status={}'.format(resp2.status_code))
    d2 = resp2.get_json()
    if d2:
        item = d2.get('item', {})
        att_count = len(item.get('attachments', []))
        rag = item.get('rag_status', '?')
        print('  success={} attachments={} rag_status={}'.format(d2.get('success'), att_count, rag))
    else:
        print('  body:', resp2.get_data(as_text=True)[:200])
"""

_, o, e = s.exec_command(f'cd /opt/blossom/web && /opt/blossom/web/venv/bin/python3 << PYEOF\n{script}\nPYEOF')
out = o.read().decode()
err = e.read().decode().strip()
# Print only output lines, skip startup noise
for line in out.split('\n'):
    if line.strip() and not line.startswith('['):
        print(line)

if err:
    for line in err.split('\n')[-10:]:
        if line.strip():
            print('ERR:', line)

s.close()
