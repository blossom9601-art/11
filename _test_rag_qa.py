"""RAG Q&A 통합 테스트."""
import os, json
from app import create_app

app = create_app()
with app.test_client() as c:
    with c.session_transaction() as sess:
        sess['emp_no'] = 'TEST0001'
        sess['user_id'] = 2
        sess['role'] = 'ADMIN'
        from datetime import datetime
        sess['_login_at'] = datetime.utcnow().isoformat()
        sess['_last_active'] = datetime.utcnow().isoformat()

    # Check RAG DB status
    rag_path = os.path.join(app.instance_path, 'rag_index.db')
    print('RAG DB exists:', os.path.exists(rag_path))
    if os.path.exists(rag_path):
        import sqlite3
        conn = sqlite3.connect(rag_path)
        doc_count = conn.execute('SELECT COUNT(*) FROM rag_documents').fetchone()[0]
        chunk_count = conn.execute('SELECT COUNT(*) FROM rag_chunks').fetchone()[0]
        conn.close()
        print(f'Documents: {doc_count}, Chunks: {chunk_count}')

    # Test unified search
    resp = c.post('/api/search/unified',
                  data=json.dumps({'q': 'VPN', 'limit': 5}),
                  content_type='application/json')
    print(f'\nStatus: {resp.status_code}')
    data = resp.get_json()
    if data:
        print('success:', data.get('success'))
        print('total:', data.get('total'))
        print('has rag_evidence:', 'rag_evidence' in data)
        print('has rag_answer:', 'rag_answer' in data)
        if 'rag_evidence' in data:
            print('rag_evidence count:', len(data['rag_evidence']))
            for item in data['rag_evidence'][:2]:
                print('  -', item.get('title','')[:50])
        if 'rag_answer' in data:
            ans = data['rag_answer']
            print('answer:', ans.get('answer_text','')[:200])
            print('sources:', len(ans.get('sources',[])))
    else:
        print('Response body is None')
        print('Raw:', resp.data[:500])
