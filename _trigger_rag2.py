import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

script = r"""
import sys, os
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')

# Use venv python packages
venv_site = '/opt/blossom/web/.venv/lib/python3.9/site-packages'
if os.path.isdir(venv_site):
    sys.path.insert(0, venv_site)
venv_site2 = '/opt/blossom/web/.venv/lib64/python3.9/site-packages'
if os.path.isdir(venv_site2):
    sys.path.insert(0, venv_site2)

from app import create_app
app = create_app()
with app.test_client() as c:
    with c.session_transaction() as sess:
        sess['user_id'] = 1
        sess['emp_no'] = 'admin'
    resp = c.get('/api/insight/items?limit=5')
    data = resp.get_json()
    print('items success:', data.get('success'))
    items = data.get('rows') or data.get('items') or []
    print('items count:', len(items))

    for it in items[:5]:
        iid = it.get('id')
        resp2 = c.get('/api/insight/items/{}'.format(iid))
        d2 = resp2.get_json()
        item = d2.get('item', {})
        att_count = len(item.get('attachments', []))
        rag = item.get('rag_status', '?')
        print('  GET id={}: attachments={}, rag_status={}'.format(iid, att_count, rag))

import sqlite3, time
time.sleep(2)
conn = sqlite3.connect('instance/rag_index.db')
conn.row_factory = sqlite3.Row
jobs = conn.execute('SELECT id, source_id, status FROM rag_index_jobs ORDER BY id DESC LIMIT 10').fetchall()
print('\nRAG jobs after trigger:')
for j in jobs:
    print('  {}'.format(dict(j)))
if not jobs:
    print('  (none)')
conn.close()
"""

_, o, e = s.exec_command(f'cd /opt/blossom/web && /opt/blossom/web/.venv/bin/python3 << PYEOF\n{script}\nPYEOF')
out = o.read().decode()
err = e.read().decode().strip()
print(out)
if err:
    print('ERR:', err[-1500:])

s.close()
