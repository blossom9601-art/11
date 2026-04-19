import paramiko, json

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

script = r"""
import sqlite3, json, os

db_path = 'instance/rag_index.db'
c = sqlite3.connect(db_path)
c.row_factory = sqlite3.Row

doc_count = c.execute('SELECT COUNT(*) FROM rag_documents WHERE status="active"').fetchone()[0]
chunk_count = c.execute('SELECT COUNT(*) FROM rag_chunks').fetchone()[0]
print(f'docs={doc_count}, chunks={chunk_count}')

docs = c.execute('SELECT id, source_type, source_domain, source_id, substr(title,1,80) AS t, entity_type FROM rag_documents WHERE status="active"').fetchall()
print('\n=== Documents ===')
for d in docs:
    print(f'  id={d["id"]} type={d["source_type"]} domain={d["source_domain"]} src={d["source_id"]} entity={d["entity_type"]}')
    print(f'    title: {d["t"][:70]}')

chunks = c.execute('SELECT document_id, chunk_index, substr(chunk_text,1,120) AS t FROM rag_chunks ORDER BY id LIMIT 5').fetchall()
print('\n=== Sample Chunks ===')
for ch in chunks:
    print(f'  doc={ch["document_id"]} idx={ch["chunk_index"]} text={ch["t"]}...')

test_queries = ['AI', 'VPN', '보안', '트렌드', 'zzz']
print('\n=== Search Tests ===')
for q in test_queries:
    pattern = f'%{q}%'
    cnt = c.execute('SELECT COUNT(*) FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE d.status="active" AND (c.chunk_text LIKE ? OR d.title LIKE ?)', (pattern, pattern)).fetchone()[0]
    print(f'  "{q}" => {cnt} chunks')

try:
    main_db = 'instance/blossom.db'
    mc = sqlite3.connect(main_db)
    total = mc.execute('SELECT COUNT(*) FROM insight_items').fetchone()[0]
    with_att = mc.execute("SELECT COUNT(*) FROM insight_items WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'").fetchone()[0]
    print(f'\nInsight items: total={total}, with_attachments={with_att}')
    
    # Check what items exist
    items = mc.execute("SELECT id, category, substr(title,1,40) AS t, CASE WHEN attachments IS NOT NULL AND attachments != '' AND attachments != '[]' THEN 'Y' ELSE 'N' END AS has_att FROM insight_items ORDER BY id").fetchall()
    for i in items:
        print(f'  id={i[0]} cat={i[1]} att={i[3]} title={i[2]}')
    mc.close()
except Exception as e:
    print(f'ERR: {e}')

c.close()
"""

_, o, e = s.exec_command(f'cd /opt/blossom/web && /opt/blossom/web/venv/bin/python3 << PYEOF\n{script}\nPYEOF')
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print('ERR:', err[-500:])
s.close()
