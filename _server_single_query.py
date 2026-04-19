"""단일 쿼리 E2E 테스트 (모델 웜업 상태에서)"""
import sys, os, json, time
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
os.environ['FLASK_APP'] = 'run.py'

from datetime import datetime
from app import create_app
app = create_app()

# 테스트할 쿼리 (커맨드라인 인자)
q = sys.argv[1] if len(sys.argv) > 1 else 'AI 시장 전망'

with app.test_client() as c:
    with c.session_transaction() as sess:
        sess['user_id'] = 1
        sess['emp_no'] = 'ADMIN'
        sess['role'] = 'ADMIN'
        sess['_login_at'] = datetime.utcnow().isoformat()
        sess['_last_active'] = datetime.utcnow().isoformat()

    t0 = time.time()
    r = c.post('/api/search/unified',
                json={'q': q, 'limit': 20},
                headers={'X-Requested-With': 'XMLHttpRequest'},
                content_type='application/json')
    elapsed = time.time() - t0
    d = r.get_json()
    rag = d.get('rag_answer') or {}
    method = rag.get('method', 'none')
    answer = (rag.get('answer_text') or '')[:500]
    sources = len(rag.get('sources', []))
    total = d.get('total', 0)
    print(f'query={q}')
    print(f'time={elapsed:.1f}s')
    print(f'total={total}')
    print(f'method={method}')
    print(f'sources={sources}')
    print(f'answer={answer}')
