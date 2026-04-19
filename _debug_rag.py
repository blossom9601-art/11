"""RAG 디버깅 - 서버에서 직접 실행"""
import paramiko, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. RAG DB 상태 확인
print('=== RAG DB Status ===')
_, o, e = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python -c "
import sqlite3, os
db = '/opt/blossom/web/instance/rag_index.db'
print('exists:', os.path.exists(db))
conn = sqlite3.connect(db)
c = conn.cursor()
tables = [r[0] for r in c.execute(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\").fetchall()]
print('tables:', tables)
for t in tables:
    cnt = c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'  {t}: {cnt} rows')
conn.close()
" """,
    timeout=15
)
print(o.read().decode().strip())
err = e.read().decode().strip()
if err: print('ERR:', err[:300])

# 2. Unified search에서 rag_answer 구조 확인
print('\n=== Search API Response Structure ===')
_, o, e = ssh.exec_command(
    '/opt/blossom/web/venv/bin/python -c "'
    'import sys, json; sys.path.insert(0, \\"/opt/blossom/web\\"); '
    'from run import app; '
    'c = app.test_client(); '
    'c.post(\\"/api/auth/login\\", json={\\"emp_no\\":\\"admin\\",\\"password\\":\\"admin\\"}); '
    'r = c.get(\\"/api/unified-search?q=AI\\"); '
    'd = r.get_json(); '
    'print(\\"status:\\", r.status_code); '
    'print(\\"keys:\\", list(d.keys())); '
    'rag = d.get(\\"rag_answer\\"); '
    'print(\\"rag_answer type:\\", type(rag).__name__); '
    'print(\\"rag_answer:\\", json.dumps(rag, ensure_ascii=False, default=str)[:500] if rag else None); '
    'print(\\"total:\\", d.get(\\"total\\")); '
    '" 2>&1 | grep -v "\\[" | head -20',
    timeout=30
)
print(o.read().decode().strip())

# 3. Check Ollama config in the app
print('\n=== App Config Check ===')
_, o, e = ssh.exec_command(
    '/opt/blossom/web/venv/bin/python -c "'
    'import sys; sys.path.insert(0, \\"/opt/blossom/web\\"); '
    'from run import app; '
    'with app.app_context(): '
    '    print(\\"OLLAMA_MODEL:\\", app.config.get(\\"OLLAMA_MODEL\\")); '
    '    print(\\"OLLAMA_TIMEOUT:\\", app.config.get(\\"OLLAMA_TIMEOUT\\")); '
    '    print(\\"OLLAMA_BASE_URL:\\", app.config.get(\\"OLLAMA_BASE_URL\\")); '
    '" 2>&1 | tail -5',
    timeout=15
)
print(o.read().decode().strip())

ssh.close()
print('\n[DONE]')
