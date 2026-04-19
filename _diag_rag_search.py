import paramiko, json

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

script = r"""
import sqlite3, json, os

db_path = 'instance/rag_index.db'
if not os.path.exists(db_path):
    print('RAG DB NOT FOUND'); exit()

c = sqlite3.connect(db_path)
c.row_factory = sqlite3.Row

# 1. 전체 문서/청크 수
doc_count = c.execute('SELECT COUNT(*) FROM rag_documents WHERE status="active"').fetchone()[0]
chunk_count = c.execute('SELECT COUNT(*) FROM rag_chunks').fetchone()[0]
print(f'=== DB Stats: docs={doc_count}, chunks={chunk_count} ===')

# 2. 모든 문서 목록
docs = c.execute('SELECT id, source_type, source_domain, source_id, title[:80] AS short_title, entity_type FROM rag_documents WHERE status="active"').fetchall()
print('\n=== Documents ===')
for d in docs:
    print(f'  id={d["id"]} type={d["source_type"]} domain={d["source_domain"]} src={d["source_id"]} entity={d["entity_type"]} title={d["short_title"][:60]}')

# 3. 청크 내용 샘플 (첫 5개)
chunks = c.execute('SELECT document_id, chunk_index, chunk_text FROM rag_chunks ORDER BY id LIMIT 5').fetchall()
print('\n=== Sample Chunks ===')
for ch in chunks:
    print(f'  doc={ch["document_id"]} idx={ch["chunk_index"]} text={ch["chunk_text"][:120]}...')

# 4. 테스트 검색: 자주 나올만한 키워드
test_queries = ['AI', 'VPN', '서버', '보안', '정책', '트렌드']
print('\n=== Search Tests ===')
for q in test_queries:
    pattern = f'%{q}%'
    cnt = c.execute('SELECT COUNT(*) FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE d.status="active" AND (c.chunk_text LIKE ? OR d.title LIKE ?)', (pattern, pattern)).fetchone()[0]
    print(f'  "{q}" => {cnt} matching chunks')

# 5. 잡 히스토리
jobs = c.execute('SELECT id, source_id, action, status, error_message FROM rag_index_jobs ORDER BY id DESC LIMIT 10').fetchall()
print('\n=== Recent Jobs ===')
for j in jobs:
    err = j['error_message'][:60] if j['error_message'] else ''
    print(f'  id={j["id"]} src={j["source_id"]} action={j["action"]} status={j["status"]} err={err}')

# 6. insight items 총 수 (첨부파일 있는 항목 수)
try:
    main_db = 'instance/blossom.db'
    if os.path.exists(main_db):
        mc = sqlite3.connect(main_db)
        total_items = mc.execute('SELECT COUNT(*) FROM insight_items').fetchone()[0]
        items_with_attach = mc.execute("SELECT COUNT(*) FROM insight_items WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'").fetchone()[0]
        print(f'\n=== Insight Items: total={total_items}, with_attachments={items_with_attach} ===')
        mc.close()
except Exception as e:
    print(f'Insight check error: {e}')

c.close()
"""

_, o, e = s.exec_command(f'cd /opt/blossom/web && /opt/blossom/web/venv/bin/python3 << PYEOF\n{script}\nPYEOF')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('ERR:', err[-500:])

s.close()
