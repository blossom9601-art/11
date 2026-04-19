import paramiko, time

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

# Check RAG jobs after permission fix
script = """
import sqlite3
c = sqlite3.connect('instance/rag_index.db')
c.row_factory = sqlite3.Row
rows = c.execute('SELECT * FROM rag_index_jobs ORDER BY id DESC LIMIT 10').fetchall()
if not rows:
    print('no jobs')
else:
    for r in rows:
        print(dict(r))

print()
docs = c.execute('SELECT id, source_id, status FROM rag_documents ORDER BY id DESC LIMIT 5').fetchall()
print('docs:', len(docs))
for d in docs:
    print(dict(d))

chunks = c.execute('SELECT COUNT(*) FROM rag_chunks').fetchone()[0]
print('chunks:', chunks)
c.close()
"""

_, o, e = s.exec_command(f'cd /opt/blossom/web && python3 << PYEOF\n{script}\nPYEOF')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('ERR:', err)

# Check recent logs
_, o, _ = s.exec_command('journalctl -u blossom-web --no-pager -n 20 --since "1 min ago" 2>&1')
print('=== recent logs ===')
print(o.read().decode())

s.close()
