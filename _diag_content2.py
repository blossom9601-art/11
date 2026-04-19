"""Check actual blog and insight_item content on production."""
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# Write a proper Python script to the server
script = '''
import sqlite3, os
db_path = "/opt/blossom/web/instance/dev_blossom.db"
conn = sqlite3.connect(db_path, timeout=5)
conn.row_factory = sqlite3.Row

print("=== BLOG ROWS ===")
rows = conn.execute("SELECT id, title, content_html, author, tags FROM blog").fetchall()
for r in rows:
    clen = len(r["content_html"] or "")
    preview = (r["content_html"] or "")[:200]
    print("  id=%s title=%s clen=%d author=%s tags=%s" % (r["id"], r["title"], clen, r["author"], r["tags"]))
    print("    preview: %s" % preview)

print("")
print("=== INSIGHT_ITEM ROWS ===")
rows = conn.execute("SELECT id, category, title, content_html, author, tags, is_deleted FROM insight_item").fetchall()
for r in rows:
    clen = len(r["content_html"] or "")
    preview = (r["content_html"] or "")[:200]
    print("  id=%s cat=%s title=%s clen=%d author=%s tags=%s del=%s" % (r["id"], r["category"], r["title"], clen, r["author"], r["tags"], r["is_deleted"]))
    print("    preview: %s" % preview)

conn.close()
'''

sftp = ssh.open_sftp()
remote_script = f'{REMOTE_BASE}/_check_content.py'
with sftp.file(remote_script, 'w') as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command(f'{REMOTE_BASE}/venv/bin/python {remote_script}')
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print(f'STDERR: {err[:300]}')

ssh.close()
