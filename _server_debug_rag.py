"""서버에서 실행할 RAG 디버깅 스크립트"""
import sqlite3, os, sys, json

# 1. RAG DB
db = '/opt/blossom/web/instance/rag_index.db'
print('=== RAG DB ===')
print('exists:', os.path.exists(db))
if os.path.exists(db):
    conn = sqlite3.connect(db)
    c = conn.cursor()
    tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    print('tables:', tables)
    for t in tables:
        cnt = c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
        print(f'  {t}: {cnt} rows')
        if cnt > 0:
            cols = [d[0] for d in c.execute(f'SELECT * FROM {t} LIMIT 1').description]
            print(f'  columns: {cols}')
            row = c.execute(f'SELECT * FROM {t} LIMIT 1').fetchone()
            print(f'  sample: {str(row)[:200]}')
    conn.close()

# 2. App config
sys.path.insert(0, '/opt/blossom/web')
print('\n=== App Config ===')
from run import app
with app.app_context():
    print('OLLAMA_MODEL:', app.config.get('OLLAMA_MODEL'))
    print('OLLAMA_TIMEOUT:', app.config.get('OLLAMA_TIMEOUT'))
    print('OLLAMA_BASE_URL:', app.config.get('OLLAMA_BASE_URL'))

# 3. Search API test
print('\n=== Search API ===')
c = app.test_client()
r = c.post('/api/auth/login', json={'emp_no': 'admin', 'password': 'admin'})
print('login:', r.status_code)

r = c.get('/api/unified-search?q=AI')
d = r.get_json()
print('status:', r.status_code)
print('keys:', list(d.keys()))
rag = d.get('rag_answer')
print('rag_answer:', json.dumps(rag, ensure_ascii=False, default=str)[:500] if rag else None)
print('total:', d.get('total'))
