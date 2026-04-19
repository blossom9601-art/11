#!/usr/bin/env python3
"""검색 품질 개선 + RAG 벌크 인덱싱 배포 스크립트

변경사항:
1. Blog 검색에 content_html 추가
2. Insight 아이템 검색 추가 (별도 SQLite DB)
3. Blog/InsightItem 본문을 RAG DB에 벌크 인덱싱
"""
import paramiko, os, sys, time

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'
SERVICE = 'blossom-web'

LOCAL_FILES = {
    'app/routes/api.py':  f'{REMOTE_BASE}/app/routes/api.py',
}

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    local_base = os.path.dirname(os.path.abspath(__file__))

    # 1) 파일 배포
    for local_rel, remote_path in LOCAL_FILES.items():
        local_path = os.path.join(local_base, local_rel)
        if not os.path.exists(local_path):
            print(f'[SKIP] {local_path} not found')
            continue
        print(f'[DEPLOY] {local_rel} → {remote_path}')
        sftp.put(local_path, remote_path)

    sftp.close()

    # 2) RAG 벌크 인덱싱 스크립트 전송 및 실행
    bulk_script = '''#!/usr/bin/env python3
"""Blog + InsightItem 본문을 RAG DB에 벌크 인덱싱"""
import sqlite3, os, sys, re, json
from hashlib import sha256

INSTANCE = "/opt/blossom/web/instance"
RAG_DB = os.path.join(INSTANCE, "rag_index.db")
MAIN_DB = os.path.join(INSTANCE, "blossom.db")
INSIGHT_DB = os.path.join(INSTANCE, "insight_item.db")

def strip_html(html):
    """HTML 태그를 제거하고 텍스트만 반환"""
    text = re.sub(r'<[^>]+>', ' ', html or '')
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'&#39;', "'", text)
    text = re.sub(r'\\s+', ' ', text)
    return text.strip()

def normalize_text(text):
    return re.sub(r'\\s+', ' ', (text or '').strip())

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

def content_hash(title, body):
    payload = "\\n".join([title or '', body or ''])
    return sha256(payload.encode('utf-8')).hexdigest()

def chunk_hash(text):
    return sha256((text or '').encode('utf-8')).hexdigest()

def upsert_doc(conn, source_type, source_domain, source_id, source_sub_id,
               title, body_text, summary_text, route_hint,
               menu_code='', page_key='', entity_type='', tags_json='[]'):
    chash = content_hash(title, body_text)
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
        ch = chunk_hash(text)
        tc = max(1, len(text.split()))
        conn.execute("""
            INSERT INTO rag_chunks (document_id, chunk_index, chunk_text, chunk_hash, token_count,
                                    embedding_model, embedding_vector, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '', '', datetime('now'), datetime('now'))
        """, (doc_id, ci, text, ch, tc))

def index_blogs(rag_conn):
    if not os.path.exists(MAIN_DB):
        print(f"[SKIP] {MAIN_DB} not found")
        return 0
    main_conn = sqlite3.connect(MAIN_DB, timeout=5)
    main_conn.row_factory = sqlite3.Row
    rows = main_conn.execute("SELECT id, title, content_html, author, tags FROM blog").fetchall()
    count = 0
    for r in rows:
        body = strip_html(r['content_html'])
        if not body or len(body) < 10:
            continue
        title = r['title'] or f"블로그 {r['id']}"
        tags = r['tags'] or ''
        full_text = f"{title}. {tags}. {body}"
        doc_id = upsert_doc(
            rag_conn,
            source_type='db_row',
            source_domain='blog',
            source_id=str(r['id']),
            source_sub_id='',
            title=title,
            body_text=normalize_text(full_text),
            summary_text=normalize_text(body[:300]),
            route_hint=f"/p/insight_blog_it_detail?id={r['id']}",
            menu_code='insight.blog',
            page_key='insight_blog_it',
            entity_type='blog_post',
            tags_json=json.dumps([t.strip() for t in tags.split(',') if t.strip()], ensure_ascii=False) if tags else '[]',
        )
        chunks = chunk_text(full_text)
        replace_chunks(rag_conn, doc_id, chunks)
        count += 1
        print(f"  [BLOG] id={r['id']} title={title[:40]} chunks={len(chunks)}")
    main_conn.close()
    return count

def index_insight_items(rag_conn):
    if not os.path.exists(INSIGHT_DB):
        print(f"[SKIP] {INSIGHT_DB} not found")
        return 0
    ins_conn = sqlite3.connect(INSIGHT_DB, timeout=5)
    ins_conn.row_factory = sqlite3.Row
    try:
        rows = ins_conn.execute(
            "SELECT id, category, title, author, tags, content_html FROM insight_item WHERE COALESCE(is_deleted,0)=0"
        ).fetchall()
    except Exception as e:
        print(f"[ERROR] insight_item query failed: {e}")
        ins_conn.close()
        return 0

    cat_page = {
        'trend': 'insight_blog_trend',
        'security': 'insight_blog_security',
        'report': 'insight_blog_report',
        'technical': 'insight_blog_tech',
        'tech': 'insight_blog_tech',
    }
    count = 0
    for r in rows:
        body = strip_html(r['content_html'])
        if not body or len(body) < 10:
            continue
        title = r['title'] or f"인사이트 {r['id']}"
        tags = r['tags'] or ''
        cat = (r['category'] or 'tech').lower()
        full_text = f"{title}. {tags}. {body}"
        pk = cat_page.get(cat, 'insight_blog_tech')
        doc_id = upsert_doc(
            rag_conn,
            source_type='db_row',
            source_domain=cat,
            source_id=str(r['id']),
            source_sub_id='',
            title=title,
            body_text=normalize_text(full_text),
            summary_text=normalize_text(body[:300]),
            route_hint=f"/p/{pk}_detail?id={r['id']}",
            menu_code='insight.blog',
            page_key=pk,
            entity_type='insight_item',
            tags_json=json.dumps([t.strip() for t in tags.split(',') if t.strip()], ensure_ascii=False) if tags else '[]',
        )
        chunks = chunk_text(full_text)
        replace_chunks(rag_conn, doc_id, chunks)
        count += 1
        print(f"  [INSIGHT] id={r['id']} cat={cat} title={title[:40]} chunks={len(chunks)}")
    ins_conn.close()
    return count

if __name__ == '__main__':
    if not os.path.exists(RAG_DB):
        print(f"[ERROR] {RAG_DB} not found")
        sys.exit(1)

    rag_conn = sqlite3.connect(RAG_DB, timeout=10)
    rag_conn.row_factory = sqlite3.Row

    # 현재 상태
    before = rag_conn.execute("SELECT COUNT(*) FROM rag_documents").fetchone()[0]
    before_c = rag_conn.execute("SELECT COUNT(*) FROM rag_chunks").fetchone()[0]
    print(f"[BEFORE] documents={before}, chunks={before_c}")

    # 인덱싱
    b = index_blogs(rag_conn)
    rag_conn.commit()
    i = index_insight_items(rag_conn)
    rag_conn.commit()

    # 결과
    after = rag_conn.execute("SELECT COUNT(*) FROM rag_documents").fetchone()[0]
    after_c = rag_conn.execute("SELECT COUNT(*) FROM rag_chunks").fetchone()[0]
    print(f"\\n[AFTER] documents={after} (+{after-before}), chunks={after_c} (+{after_c-before_c})")
    print(f"[INDEXED] blogs={b}, insight_items={i}")

    rag_conn.close()
'''

    # 벌크 인덱싱 스크립트 업로드 & 실행
    bulk_remote = f'{REMOTE_BASE}/_bulk_rag_index.py'
    with sftp_reconnect(ssh) as sftp2:
        with sftp2.file(bulk_remote, 'w') as f:
            f.write(bulk_script)
    print('\n[BULK] Running RAG bulk indexing on server...')
    stdin, stdout, stderr = ssh.exec_command(
        f'cd {REMOTE_BASE} && {REMOTE_BASE}/venv/bin/python {bulk_remote}'
    )
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print(f'[STDERR] {err}')

    # 3) 서비스 재시작
    print(f'\n[RESTART] {SERVICE}...')
    stdin, stdout, stderr = ssh.exec_command(f'systemctl restart {SERVICE}')
    stdout.read()
    time.sleep(2)

    # 4) 검증
    print('[VERIFY] Testing search...')
    stdin, stdout, stderr = ssh.exec_command(f'''
cd {REMOTE_BASE} && {REMOTE_BASE}/venv/bin/python -c "
import sys, os
sys.path.insert(0, '.')
os.environ['FLASK_APP'] = 'run.py'
from app import create_app
app = create_app()
with app.test_client() as c:
    # 로그인
    c.post('/api/login', json={{'username': 'admin', 'password': 'admin'}})
    # 검색 테스트
    for q in ['AI', 'VPN', '서버', '보안', '블로그']:
        r = c.post('/api/search/unified', json={{'q': q, 'limit': 5}})
        d = r.get_json()
        total = d.get('total', 0)
        has_rag = 'rag_answer' in d
        has_evidence = len(d.get('rag_evidence', []))
        print(f'  {{q}}: total={{total}}, rag_answer={{has_rag}}, evidence={{has_evidence}}')
"
''')
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print(f'[STDERR] {err[:500]}')

    ssh.close()
    print('\n[DONE]')


def sftp_reconnect(ssh):
    """컨텍스트 매니저로 SFTP 재연결"""
    class _Ctx:
        def __enter__(self):
            self.sftp = ssh.open_sftp()
            return self.sftp
        def __exit__(self, *args):
            self.sftp.close()
    return _Ctx()


if __name__ == '__main__':
    main()
