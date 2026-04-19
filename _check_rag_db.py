import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

script = '''
import sqlite3, os
db = '/opt/blossom/web/instance/rag_index.db'
if not os.path.exists(db):
    print('DB not found'); exit()
c = sqlite3.connect(db)
c.row_factory = sqlite3.Row

print('=== rag_index_jobs ===')
rows = c.execute('SELECT * FROM rag_index_jobs ORDER BY id DESC LIMIT 10').fetchall()
if not rows:
    print('(no jobs)')
for r in rows:
    print(dict(r))

print()
print('=== rag_documents ===')
rows = c.execute('SELECT id, source_id, source_domain, title, status, created_at FROM rag_documents ORDER BY id DESC LIMIT 5').fetchall()
if not rows:
    print('(no documents)')
for r in rows:
    print(dict(r))

print()
print('=== rag_chunks count ===')
print(c.execute('SELECT COUNT(*) FROM rag_chunks').fetchone()[0])

c.close()
'''

_, o, e = s.exec_command(f'cd /opt/blossom/web && python3 -c "{script}"')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('STDERR:', err)

s.close()
