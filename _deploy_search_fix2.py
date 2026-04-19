"""Deploy search quality fix + RAG bulk indexing.

Changes:
1. Blog search now includes content_html body text
2. InsightItem search added (same SQLAlchemy DB via db.session)
3. Bulk-index blog + insight_item content into RAG DB
"""
import paramiko, os, time

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'
SERVICE = 'blossom-web'

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    local_base = os.path.dirname(os.path.abspath(__file__))

    # 1) Deploy api.py
    local_path = os.path.join(local_base, 'app', 'routes', 'api.py')
    remote_path = f'{REMOTE_BASE}/app/routes/api.py'
    print(f'[DEPLOY] api.py')
    sftp.put(local_path, remote_path)
    sftp.close()

    # 2) Upload and run bulk indexing script on server
    bulk_script = r'''
import sqlite3, os, sys, re, json
from hashlib import sha256

INSTANCE = "/opt/blossom/web/instance"
RAG_DB = os.path.join(INSTANCE, "rag_index.db")
MAIN_DB = os.path.join(INSTANCE, "dev_blossom.db")

def strip_html(html):
    text = re.sub(r'<[^>]+>', ' ', html or '')
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'&#39;', "'", text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def normalize_text(text):
    return re.sub(r'\s+', ' ', (text or '').strip())

def chunk_text(text, chunk_size=420, overlap=60):
    source = normalize_text(text)
    if not source:
        return []
    words = source.split(' ')
    if not words:
        return []
    chunks = []
    step = max(1, chunk_size - overlap)
    idx = 0
    ci = 0
    while idx < len(words):
        piece = words[idx:idx + chunk_size]
        if not piece:
            break
        chunks.append((ci, ' '.join(piece)))
        ci += 1
        idx += step
    return chunks

def content_hash_fn(title, body):
    payload = "\n".join([title or '', body or ''])
    return sha256(payload.encode('utf-8')).hexdigest()

def chunk_hash_fn(text):
    return sha256((text or '').encode('utf-8')).hexdigest()

def upsert_doc(conn, source_type, source_domain, source_id, source_sub_id,
               title, body_text, summary_text, route_hint,
               menu_code='', page_key='', entity_type='', tags_json='[]'):
    chash = content_hash_fn(title, body_text)
    conn.execute("""
        INSERT INTO rag_documents (
            source_type, source_domain, source_id, source_sub_id,
            title, body_text, summary_text, route_hint,
            menu_code, page_key, entity_type,
            owner_dept, security_level, permission_scope,
            tags_json, metadata_json, content_hash,
            status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'internal', '', ?, '{}', ?, 'active', datetime('now'), datetime('now'))
        ON CONFLICT(source_type, source_domain, source_id, source_sub_id)
        DO UPDATE SET
            title=excluded.title,
            body_text=excluded.body_text,
            summary_text=excluded.summary_text,
            route_hint=excluded.route_hint,
            content_hash=excluded.content_hash,
            tags_json=excluded.tags_json,
            status='active',
            updated_at=datetime('now')
    """, (source_type, source_domain, source_id, source_sub_id,
          title, body_text, summary_text[:300], route_hint,
          menu_code, page_key, entity_type, tags_json, chash))
    row = conn.execute(
        "SELECT id FROM rag_documents WHERE source_type=? AND source_domain=? AND source_id=? AND source_sub_id=?",
        (source_type, source_domain, source_id, source_sub_id)
    ).fetchone()
    return row[0]

def replace_chunks(conn, doc_id, chunks):
    conn.execute("DELETE FROM rag_chunks WHERE document_id = ?", (doc_id,))
    for ci, text in chunks:
        ch = chunk_hash_fn(text)
        tc = max(1, len(text.split()))
        conn.execute("""
            INSERT INTO rag_chunks (document_id, chunk_index, chunk_text, chunk_hash, token_count,
                                    embedding_model, embedding_vector, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '', '', datetime('now'), datetime('now'))
        """, (doc_id, ci, text, ch, tc))

if not os.path.exists(RAG_DB):
    print(f"[ERROR] {RAG_DB} not found")
    sys.exit(1)
if not os.path.exists(MAIN_DB):
    print(f"[ERROR] {MAIN_DB} not found")
    sys.exit(1)

rag_conn = sqlite3.connect(RAG_DB, timeout=10)
main_conn = sqlite3.connect(MAIN_DB, timeout=5)
main_conn.row_factory = sqlite3.Row

before_d = rag_conn.execute("SELECT COUNT(*) FROM rag_documents").fetchone()[0]
before_c = rag_conn.execute("SELECT COUNT(*) FROM rag_chunks").fetchone()[0]
print(f"[BEFORE] documents={before_d}, chunks={before_c}")

# Index blogs
blog_count = 0
try:
    rows = main_conn.execute("SELECT id, title, content_html, author, tags FROM blog").fetchall()
    for r in rows:
        body = strip_html(r['content_html'])
        if not body or len(body) < 10:
            continue
        title = r['title'] or f"Blog {r['id']}"
        tags = r['tags'] or ''
        full_text = f"{title}. {tags}. {body}"
        doc_id = upsert_doc(rag_conn, 'db_row', 'blog', str(r['id']), '',
                            title, normalize_text(full_text), normalize_text(body[:300]),
                            f"/p/insight_blog_it_detail?id={r['id']}",
                            'insight.blog', 'insight_blog_it', 'blog_post',
                            json.dumps([t.strip() for t in tags.split(',') if t.strip()], ensure_ascii=False) if tags else '[]')
        chunks = chunk_text(full_text)
        replace_chunks(rag_conn, doc_id, chunks)
        blog_count += 1
        print(f"  [BLOG] id={r['id']} title={title[:50]} chunks={len(chunks)}")
    rag_conn.commit()
except Exception as e:
    print(f"[ERROR] Blog indexing failed: {e}")

# Index insight items
insight_count = 0
try:
    rows = main_conn.execute(
        "SELECT id, category, title, author, tags, content_html FROM insight_item WHERE COALESCE(is_deleted,0)=0"
    ).fetchall()
    cat_page = {
        'trend': 'insight_blog_trend', 'security': 'insight_blog_security',
        'report': 'insight_blog_report', 'technical': 'insight_blog_tech', 'tech': 'insight_blog_tech',
    }
    for r in rows:
        body = strip_html(r['content_html'])
        if not body or len(body) < 10:
            continue
        title = r['title'] or f"Insight {r['id']}"
        tags = r['tags'] or ''
        cat = (r['category'] or 'tech').lower()
        full_text = f"{title}. {tags}. {body}"
        pk = cat_page.get(cat, 'insight_blog_tech')
        doc_id = upsert_doc(rag_conn, 'db_row', cat, str(r['id']), '',
                            title, normalize_text(full_text), normalize_text(body[:300]),
                            f"/p/{pk}_detail?id={r['id']}",
                            'insight.blog', pk, 'insight_item',
                            json.dumps([t.strip() for t in tags.split(',') if t.strip()], ensure_ascii=False) if tags else '[]')
        chunks = chunk_text(full_text)
        replace_chunks(rag_conn, doc_id, chunks)
        insight_count += 1
        print(f"  [INSIGHT] id={r['id']} cat={cat} title={title[:50]} chunks={len(chunks)}")
    rag_conn.commit()
except Exception as e:
    print(f"[ERROR] InsightItem indexing failed: {e}")

after_d = rag_conn.execute("SELECT COUNT(*) FROM rag_documents").fetchone()[0]
after_c = rag_conn.execute("SELECT COUNT(*) FROM rag_chunks").fetchone()[0]
print(f"\n[AFTER] documents={after_d} (+{after_d-before_d}), chunks={after_c} (+{after_c-before_c})")
print(f"[INDEXED] blogs={blog_count}, insight_items={insight_count}")

main_conn.close()
rag_conn.close()
'''

    sftp2 = ssh.open_sftp()
    bulk_remote = f'{REMOTE_BASE}/_bulk_rag_index.py'
    with sftp2.file(bulk_remote, 'w') as f:
        f.write(bulk_script)
    sftp2.close()

    print('\n[BULK] Running RAG bulk indexing...')
    stdin, stdout, stderr = ssh.exec_command(
        f'cd {REMOTE_BASE} && {REMOTE_BASE}/venv/bin/python {bulk_remote}'
    )
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print(f'[STDERR] {err[:500]}')

    # 3) Restart service
    print(f'[RESTART] {SERVICE}...')
    stdin, stdout, stderr = ssh.exec_command(f'systemctl restart {SERVICE}')
    stdout.read()
    time.sleep(3)

    # 4) Verify search
    print('[VERIFY] Search tests...')
    verify_cmd = f'''cd {REMOTE_BASE} && {REMOTE_BASE}/venv/bin/python -c "
import sys, os
sys.path.insert(0, '.')
os.environ['FLASK_APP'] = 'run.py'
from app import create_app
app = create_app()
with app.test_client() as c:
    c.post('/api/login', json={{'username': 'admin', 'password': 'admin'}})
    for q in ['AI', 'VPN', '서버', '보안', '블로그', '트렌드', '인사이트']:
        r = c.post('/api/search/unified', json={{'q': q, 'limit': 10}})
        d = r.get_json()
        total = d.get('total', 0)
        has_rag = bool(d.get('rag_answer'))
        evidence = len(d.get('rag_evidence', []))
        has_brief = bool(d.get('briefing', {{}}).get('enabled'))
        types = set()
        for row in d.get('rows', []):
            types.add(row.get('type', ''))
        print(f'  {{q}}: total={{total}} rag={{has_rag}} evid={{evidence}} brief={{has_brief}} types={{types or \"-\"}}')
"
'''
    stdin, stdout, stderr = ssh.exec_command(verify_cmd)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err and 'Traceback' in err:
        print(f'[STDERR] {err[:500]}')

    ssh.close()
    print('[DONE]')


if __name__ == '__main__':
    main()
