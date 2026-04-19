import paramiko, time

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

# Wait 15s for worker to process, then check
time.sleep(15)

script = """
import sqlite3
c = sqlite3.connect('instance/rag_index.db')
c.row_factory = sqlite3.Row
jobs = c.execute('SELECT id, source_id, status, created_at, finished_at FROM rag_index_jobs ORDER BY id DESC LIMIT 10').fetchall()
print('=== RAG jobs ===')
for j in jobs:
    print(dict(j))
if not jobs:
    print('(none)')

print()
docs = c.execute('SELECT id, source_id, title, status FROM rag_documents ORDER BY id DESC LIMIT 5').fetchall()
print('=== documents ===')
for d in docs:
    print(dict(d))

chunks = c.execute('SELECT COUNT(*) FROM rag_chunks').fetchone()[0]
print('chunks:', chunks)
c.close()
"""

_, o, e = s.exec_command(f'cd /opt/blossom/web && /opt/blossom/web/venv/bin/python3 << PYEOF\n{script}\nPYEOF')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('ERR:', err[-500:])

# Also check recent logs for worker activity
_, o, _ = s.exec_command('journalctl -u blossom-web --no-pager -n 20 --since "30 sec ago" 2>&1')
print('=== recent logs ===')
print(o.read().decode())

s.close()
