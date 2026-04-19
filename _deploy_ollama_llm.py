"""
Ollama 설치 + 코드 배포 + 검증 스크립트
서버 메모리 증설 후 실행
"""
import paramiko
import time

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)


def run(cmd, timeout=120, show_err=True):
    print(f'\n>>> {cmd}')
    _, o, e = ssh.exec_command(cmd, timeout=timeout)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        print(out)
    if err and show_err:
        for line in err.split('\n'):
            if line.strip():
                print(f'  [stderr] {line}')
    return out


# ── 1. 메모리 확인 ──────────────────────────────────────────────────────────
print('=' * 60)
print('[1/6] 메모리 확인')
print('=' * 60)
mem = run('free -h | head -3')
# 총 메모리 확인 (최소 4GB 권장)

# ── 2. Ollama 설치 ──────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print('[2/6] Ollama 설치')
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
    print('[OK] Ollama already installed')
    run('systemctl start ollama 2>/dev/null || true')
    time.sleep(3)

# 설치 확인
run('ollama --version')
run('systemctl is-active ollama')

# ── 3. 모델 다운로드 ────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print('[3/6] 모델 다운로드 (llama3.1:8b)')
print('=' * 60)
models = run('ollama list 2>/dev/null || echo NO_MODELS')
if 'llama3.1:8b' not in models:
    print('[PULLING] llama3.1:8b... (약 4.7GB, 시간 소요)')
    run('ollama pull llama3.1:8b', timeout=600)
else:
    print('[OK] llama3.1:8b already available')

run('ollama list')

# ── 4. 코드 배포 ────────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print('[4/6] 코드 배포')
print('=' * 60)
sftp = ssh.open_sftp()

files = [
    ('app/routes/api.py', f'{REMOTE_BASE}/app/routes/api.py'),
    ('app/routes/pages.py', f'{REMOTE_BASE}/app/routes/pages.py'),
    ('app/services/ollama_service.py', f'{REMOTE_BASE}/app/services/ollama_service.py'),
    ('static/js/addon_application/5.search.js', f'{REMOTE_BASE}/static/js/addon_application/5.search.js'),
    ('static/css/blossom.css', f'{REMOTE_BASE}/static/css/blossom.css'),
]

for local, remote in files:
    try:
        sftp.put(local, remote)
        print(f'  [OK] {local}')
    except Exception as e:
        print(f'  [FAIL] {local}: {e}')

sftp.close()

# ── 5. 서버 재시작 ──────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print('[5/6] 서버 재시작')
print('=' * 60)
run('systemctl restart blossom-web')
time.sleep(4)
run('systemctl is-active blossom-web')

# ── 6. 검증 ─────────────────────────────────────────────────────────────────
print('\n' + '=' * 60)
print('[6/6] 검증')
print('=' * 60)

# Ollama API 테스트
print('\n[Ollama API 테스트]')
run('curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; d=json.load(sys.stdin); print([m[\'name\'] for m in d.get(\'models\',[])])"')

# 간단한 Ollama 생성 테스트
print('\n[Ollama 생성 테스트]')
run("""curl -s http://localhost:11434/api/chat -d '{"model":"llama3.1:8b","messages":[{"role":"user","content":"안녕하세요. 한 문장으로 답해주세요."}],"stream":false,"options":{"num_predict":50}}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',{}).get('content','NO_RESPONSE'))" """, timeout=120)

# 검색 API 테스트
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

    queries = ["AI에 대해 설명해줘", "서버 관리 방법", "백업 정책 알려줘"]
    for q in queries:
        r = c.post("/api/search/unified",
                   json={"q": q, "limit": 20},
                   headers={"X-Requested-With": "XMLHttpRequest"},
                   content_type="application/json")
        d = r.get_json()
        total = d.get("total", 0)
        method = (d.get("rag_answer") or {}).get("method", "none")
        answer = ((d.get("rag_answer") or {}).get("answer_text") or "")[:150]
        print("[%s] total=%d method=%s" % (q, total, method))
        if answer:
            print("  -> %s..." % answer)
'''

sftp2 = ssh.open_sftp()
with sftp2.file(f'{REMOTE_BASE}/_verify_llm.py', 'w') as f:
    f.write(verify_script)
sftp2.close()

print('\n[검색 API 테스트]')
run(f'{REMOTE_BASE}/venv/bin/python {REMOTE_BASE}/_verify_llm.py', timeout=180)

ssh.close()
print('\n' + '=' * 60)
print('[DONE] 배포 완료')
print('=' * 60)
