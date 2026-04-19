"""Check actual blog and insight_item content on production."""
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

cmd = f'''{REMOTE_BASE}/venv/bin/python -c "
import sqlite3, os

db = 'instance/dev_blossom.db'
conn = sqlite3.connect('{REMOTE_BASE}/' + db, timeout=5)
conn.row_factory = sqlite3.Row

# Blog content
print('=== BLOG ROWS ===')
rows = conn.execute('SELECT id, title, LENGTH(content_html) as clen, author, tags FROM blog').fetchall()
for r in rows:
    print(f'  id={{r[\"id\"]}} title={{r[\"title\"]}} content_len={{r[\"clen\"]}} author={{r[\"author\"]}} tags={{r[\"tags\"]}}')
    # Show first 200 chars of content
    content = conn.execute('SELECT content_html FROM blog WHERE id=?', (r[\"id\"],)).fetchone()[0]
    print(f'    content_preview: {{(content or \"\")[:200]}}')

# Insight items
print()
print('=== INSIGHT_ITEM ROWS ===')
rows = conn.execute('SELECT id, category, title, LENGTH(content_html) as clen, author, tags, is_deleted FROM insight_item').fetchall()
for r in rows:
    print(f'  id={{r[\"id\"]}} cat={{r[\"category\"]}} title={{r[\"title\"]}} content_len={{r[\"clen\"]}} author={{r[\"author\"]}} tags={{r[\"tags\"]}} deleted={{r[\"is_deleted\"]}}')
    content = conn.execute('SELECT content_html FROM insight_item WHERE id=?', (r[\"id\"],)).fetchone()[0]
    print(f'    content_preview: {{(content or \"\")[:200]}}')

conn.close()
"'''

stdin, stdout, stderr = ssh.exec_command(f'cd {REMOTE_BASE} && {cmd}')
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print(f'STDERR: {err[:500]}')

ssh.close()
