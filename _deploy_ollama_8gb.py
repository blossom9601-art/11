"""Ollama 설치 + gemma3:4b 모델 + 코드 배포 + 검증"""
import paramiko
import time

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'
MODEL = 'gemma3:4b'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)


def run(cmd, timeout=300):
    print(f'\n>>> {cmd}')
    _, o, e = ssh.exec_command(cmd, timeout=timeout)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        print(out)
    if err:
        # filter noise
        for line in err.split('\n'):
            line = line.strip()
            if line and 'warning' not in line.lower():
                print(f'  [stderr] {line}')
    return out


# ── 1. Ollama 설치 ──────────────────────────────────────────────────────────
print('=' * 60)
print('[1/5] Ollama 설치')
print('=' * 60)
ollama_check = run('which ollama 2>/dev/null || echo NOT_FOUND')
if 'NOT_FOUND' in ollama_check:
    print('[INSTALLING] Ollama...')
    run('curl -fsSL https://ollama.com/install.sh | sh', timeout=300)
    time.sleep(3)
    run('systemctl enable ollama')
    run('systemctl start ollama')
    time.sleep(5)
else:
    print('[SKIP] Ollama already installed')
    run('systemctl start ollama 2>/dev/null; true')
    time.sleep(3)

run('ollama --version')
status = run('systemctl is-active ollama')
if status != 'active':
    print('[WARN] Ollama not active, trying to start...')
    run('systemctl start ollama')
    time.sleep(5)
    run('systemctl is-active ollama')

# ── 2. 모델 다운로드 ────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print(f'[2/5] 모델 다운로드 ({MODEL})')
print('=' * 60)
models = run('ollama list 2>/dev/null || echo NO_MODELS')
if MODEL not in (models or ''):
    print(f'[PULLING] {MODEL}... (약 3GB, 시간 소요)')
    run(f'ollama pull {MODEL}', timeout=600)
else:
    print(f'[SKIP] {MODEL} already available')

run('ollama list')

# ── 3. 코드 배포 ────────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print('[3/5] 코드 배포')
print('=' * 60)
sftp = ssh.open_sftp()

files = [
    ('app/routes/api.py', f'{REMOTE_BASE}/app/routes/api.py'),
    ('app/routes/pages.py', f'{REMOTE_BASE}/app/routes/pages.py'),
    ('app/services/ollama_service.py', f'{REMOTE_BASE}/app/services/ollama_service.py'),
    ('static/js/addon_application/5.search.js', f'{REMOTE_BASE}/static/js/addon_application/5.search.js'),
    ('static/css/blossom.css', f'{REMOTE_BASE}/static/css/blossom.css'),
    ('config.py', f'{REMOTE_BASE}/config.py'),
]

for local, remote in files:
    try:
        sftp.put(local, remote)
        print(f'  [OK] {local}')
    except Exception as e:
        print(f'  [FAIL] {local}: {e}')
sftp.close()

# ── 4. 서버 재시작 ──────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print('[4/5] 서버 재시작')
print('=' * 60)
run('systemctl restart blossom-web')
time.sleep(4)
run('systemctl is-active blossom-web')

# ── 5. 검증 ─────────────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print('[5/5] 검증')
print('=' * 60)

# 5-1. Ollama API 확인
print('\n[Ollama API]')
run("curl -s http://localhost:11434/api/tags | python3 -c \"import sys,json; d=json.load(sys.stdin); print([m['name'] for m in d.get('models',[])])\"")

# 5-2. LLM 생성 테스트
print('\n[LLM 생성 테스트]')
run(
    "curl -s http://localhost:11434/api/chat "
    "-d '{\"model\":\"" + MODEL + "\","
    "\"messages\":[{\"role\":\"user\",\"content\":\"AI란 무엇인지 한국어로 2문장으로 답해주세요.\"}],"
    "\"stream\":false,"
    "\"options\":{\"num_predict\":100}}' "
    "| python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get('message',{}).get('content','NO_RESPONSE'))\"",
    timeout=180
)

# 5-3. 검색 API 테스트
verify_script = r'''
import sys, os, json
sys.path.insert(0, "/opt/blossom/web")
os.chdir("/opt/blossom/web")
os.environ["FLASK_APP"] = "run.py"
from datetime import datetime
from app import create_app
app = create_app()

with app.test_client() as c:
    with c.session_transaction() as sess:
        sess["user_id"] = 1
        sess["emp_no"] = "ADMIN"
        sess["role"] = "ADMIN"
        sess["_login_at"] = datetime.utcnow().isoformat()
        sess["_last_active"] = datetime.utcnow().isoformat()

    queries = [
        "AI에 대해 설명해줘",
        "서버 관리 방법",
        "백업 정책 알려줘",
    ]
    for q in queries:
        r = c.post("/api/search/unified",
                   json={"q": q, "limit": 20},
                   headers={"X-Requested-With": "XMLHttpRequest"},
                   content_type="application/json")
        d = r.get_json()
        total = d.get("total", 0)
        rag = d.get("rag_answer") or {}
        method = rag.get("method", "none")
        answer = (rag.get("answer_text") or "")[:200]
        print("[%s] total=%d method=%s" % (q, total, method))
        if answer:
            print("  -> %s..." % answer)
        print()
'''

sftp2 = ssh.open_sftp()
with sftp2.file(f'{REMOTE_BASE}/_verify_llm.py', 'w') as f:
    f.write(verify_script)
sftp2.close()

print('\n[검색 API + LLM 답변 테스트]')
result = run(f'{REMOTE_BASE}/venv/bin/python {REMOTE_BASE}/_verify_llm.py 2>/dev/null', timeout=300)

ssh.close()
print('\n' + '=' * 60)
print('[DONE]')
print('=' * 60)
