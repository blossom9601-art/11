"""서버에서 실행 - qwen2.5:1.5b LLM RAG end-to-end 검증"""
import sys, os, json, time
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
os.environ['FLASK_APP'] = 'run.py'

from datetime import datetime
from app import create_app
app = create_app()

queries = [
    'AI에 대해 설명해줘',
    '인공지능 트렌드',
    'AI 시장 전망',
]

with app.test_client() as c:
    with c.session_transaction() as sess:
        sess['user_id'] = 1
        sess['emp_no'] = 'ADMIN'
        sess['role'] = 'ADMIN'
        sess['_login_at'] = datetime.utcnow().isoformat()
        sess['_last_active'] = datetime.utcnow().isoformat()

    for q in queries:
        t0 = time.time()
        r = c.post('/api/search/unified',
                    json={'q': q, 'limit': 20},
                    headers={'X-Requested-With': 'XMLHttpRequest'},
                    content_type='application/json')
        elapsed = time.time() - t0
        d = r.get_json()
        rag = d.get('rag_answer') or {}
        method = rag.get('method', 'none')
        answer = (rag.get('answer_text') or '')[:300]
        sources = len(rag.get('sources', []))
        total = d.get('total', 0)
        print(f'[{q}] time={elapsed:.1f}s total={total} method={method} sources={sources}')
        if answer:
            print(f'  -> {answer}')
        else:
            print('  -> (no answer)')
