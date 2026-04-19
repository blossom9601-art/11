"""Diagnose production DB state for search."""
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip()

print('=== DB Files ===')
print(run('ls -la /opt/blossom/web/instance/*.db'))

print('\n=== blossom.db tables ===')
print(run('sqlite3 /opt/blossom/web/instance/blossom.db ".tables"'))

print('\n=== insight_item.db tables ===')
print(run('sqlite3 /opt/blossom/web/instance/insight_item.db ".tables"'))

print('\n=== Blog table in all DBs ===')
print(run('for f in /opt/blossom/web/instance/*.db; do tables=$(sqlite3 "$f" ".tables" 2>/dev/null | grep -i blog); if [ -n "$tables" ]; then echo "$f: $tables"; fi; done'))

print('\n=== insight_item count ===')
print(run('sqlite3 /opt/blossom/web/instance/insight_item.db "SELECT COUNT(*) FROM insight_item WHERE COALESCE(is_deleted,0)=0"'))

print('\n=== config.py DB settings ===')
print(run('grep -i "database\\|SQLALCHEMY" /opt/blossom/web/config.py'))

print('\n=== Server count ===')
print(run('sqlite3 /opt/blossom/web/instance/blossom.db "SELECT COUNT(*) FROM server" 2>&1'))

print('\n=== Blog sample ===')
for db in ['blossom.db', 'insight_item.db']:
    r = run(f'sqlite3 /opt/blossom/web/instance/{db} "SELECT name FROM sqlite_master WHERE type=\'table\' AND name LIKE \'%blog%\'" 2>&1')
    if r:
        print(f'  {db}: {r}')

print('\n=== RAG docs ===')
print(run('sqlite3 /opt/blossom/web/instance/rag_index.db "SELECT id, source_domain, source_id, title FROM rag_documents"'))

ssh.close()
