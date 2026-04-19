"""실행 중인 blossom-web 서비스에 직접 요청하여 LLM 테스트"""
import paramiko, time, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Login to get session cookie
print('Logging in...')
_, o, _ = ssh.exec_command(
    "curl -s -c /tmp/blossom_cookie.txt -X POST http://localhost:8001/login "
    "-d 'employee_id=admin&password=admin' "
    "-H 'Content-Type: application/x-www-form-urlencoded' "
    "-w '\\nHTTP_CODE:%{http_code}' -o /dev/null -L",
    timeout=15
)
login_out = o.read().decode().strip()
print(f'Login: {login_out}')

# 2. Test queries against running service
queries = ['AI 시장 전망', '인공지능 트렌드', 'AI에 대해 설명해줘']
for q in queries:
    print(f'\n--- Query: "{q}" ---')
    t0 = time.time()
    _, o, _ = ssh.exec_command(
        f"curl -s -b /tmp/blossom_cookie.txt -X POST http://localhost:8001/api/search/unified "
        f"-H 'Content-Type: application/json' "
        f"-H 'X-Requested-With: XMLHttpRequest' "
        f"-d '{{\"q\":\"{q}\",\"limit\":20}}' "
        f"-m 200",
        timeout=210
    )
    raw = o.read().decode().strip()
    elapsed = time.time() - t0
    print(f'Time: {elapsed:.1f}s')
    try:
        d = json.loads(raw)
        rag = d.get('rag_answer') or {}
        print(f'method: {rag.get("method", "none")}')
        answer = (rag.get('answer_text') or '')[:300]
        if answer:
            print(f'answer: {answer}')
        else:
            print('answer: (none)')
        print(f'sources: {len(rag.get("sources", []))}')
    except Exception as ex:
        print(f'Parse error: {ex}')
        print(f'Raw: {raw[:300]}')

ssh.close()
print('\n[DONE]')
