"""Ollama 직접 호출 vs Flask 경유 비교"""
import paramiko, time, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. RAG 컨텍스트 가져오기 (실제 검색과 동일하게)
print('=== RAG 컨텍스트 확인 ===')
_, o, _ = ssh.exec_command(
    """/opt/blossom/web/venv/bin/python3 -c "
import sqlite3, json
conn = sqlite3.connect('/opt/blossom/web/instance/rag_index.db')
# AI 관련 청크 검색
chunks = conn.execute(
    'SELECT c.chunk_text, d.title FROM rag_chunks c JOIN rag_documents d ON c.document_id=d.id WHERE c.chunk_text LIKE ? LIMIT 3',
    ('%AI%',)
).fetchall()
for i, (text, title) in enumerate(chunks):
    print(f'chunk[{i}]: title={title}, len={len(text)}, preview={text[:80]}...')
conn.close()
" """,
    timeout=10
)
print(o.read().decode().strip())

# 2. Ollama 직접 호출 (짧은 컨텍스트)
print('\n=== Ollama 직접 호출 ===')
payload = json.dumps({
    "model": "qwen2.5:1.5b",
    "messages": [
        {"role": "system", "content": "IT 자산관리 시스템 AI 어시스턴트입니다. 한국어로 답변하세요."},
        {"role": "user", "content": "다음 문서를 기반으로 답변:\n\n[문서: AI 트렌드]\nAI 시장은 2026년 구조적으로 재편될 전망. 도입 확대와 기술 적용 범위 다변화가 주요 쟁점.\n\n질문: AI 시장 전망을 알려주세요."}
    ],
    "stream": False,
    "keep_alive": "30m",
    "options": {"temperature": 0.3, "num_predict": 128}
})

t0 = time.time()
_, o, e = ssh.exec_command(
    f"curl -s http://localhost:11434/api/chat -H 'Content-Type: application/json' -d '{payload}'",
    timeout=180
)
out = o.read().decode().strip()
elapsed = time.time() - t0
print(f'Time: {elapsed:.1f}s')
try:
    d = json.loads(out)
    print(f'Answer: {d.get("message", {}).get("content", "N/A")[:300]}')
    print(f'Eval count: {d.get("eval_count", "?")}')
    print(f'Eval duration: {d.get("eval_duration", 0)/1e9:.1f}s')
    print(f'Total duration: {d.get("total_duration", 0)/1e9:.1f}s')
except Exception as ex:
    print(f'Error: {ex}')
    print(f'Raw: {out[:300]}')

ssh.close()
print('\n[DONE]')
