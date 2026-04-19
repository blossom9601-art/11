import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

cmds = [
    ('RAG DB exists', 'ls -la /opt/blossom/web/instance/rag_index.db 2>&1'),
    ('rag_index_jobs', 'sqlite3 /opt/blossom/web/instance/rag_index.db "SELECT id, source_id, status, created_at, finished_at FROM rag_index_jobs ORDER BY id DESC LIMIT 10;" 2>&1'),
    ('rag_documents count', 'sqlite3 /opt/blossom/web/instance/rag_index.db "SELECT COUNT(*) FROM rag_documents;" 2>&1'),
    ('rag_chunks count', 'sqlite3 /opt/blossom/web/instance/rag_index.db "SELECT COUNT(*) FROM rag_chunks;" 2>&1'),
    ('blossom-web log (rag)', 'journalctl -u blossom-web --no-pager -n 50 2>&1 | grep -i rag'),
    ('blossom-web log (error)', 'journalctl -u blossom-web --no-pager -n 30 2>&1 | grep -i -E "error|exception|traceback"'),
    ('worker thread', 'journalctl -u blossom-web --no-pager -n 100 2>&1 | grep -i "rag-index-worker\\|worker"'),
]

for label, cmd in cmds:
    _, o, e = s.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    print(f'=== {label} ===')
    print(out or err or '(empty)')
    print()

s.close()
