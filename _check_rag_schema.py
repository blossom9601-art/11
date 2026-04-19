import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

script = """
import sqlite3
c = sqlite3.connect('instance/rag_index.db')
# Get column info
cols = c.execute('PRAGMA table_info(rag_index_jobs)').fetchall()
print('=== columns ===')
for col in cols:
    print(col)

print()
rows = c.execute('SELECT * FROM rag_index_jobs ORDER BY id DESC LIMIT 10').fetchall()
print('=== jobs ===')
for r in rows:
    print(r)
if not rows:
    print('(none)')

print()
docs = c.execute('SELECT * FROM rag_documents ORDER BY id DESC LIMIT 3').fetchall()
print('=== docs ===')
for d in docs:
    print(d)

chunks = c.execute('SELECT COUNT(*) FROM rag_chunks').fetchone()[0]
print('chunks:', chunks)
c.close()
"""

_, o, e = s.exec_command(f'cd /opt/blossom/web && /opt/blossom/web/venv/bin/python3 << PYEOF\n{script}\nPYEOF')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('ERR:', err[-500:])

s.close()
