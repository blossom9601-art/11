"""Blossom 검색 API 통해 LLM 답변 end-to-end 검증"""
import paramiko, time, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Update _verify_llm.py to use longer timeout matching new config
print('=== Blossom Search API - LLM Answer Verification ===\n')

# Restart blossom-web to pick up qwen2.5:1.5b config
print('Restarting blossom-web with qwen2.5:1.5b config...')
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=30)
try:
    o.read()
except Exception:
    pass
time.sleep(4)

queries = [
    'AI에 대해 설명해줘',
    '인공지능 트렌드',
    'AI 시장 전망',
]

for q in queries:
    print(f'\n--- Query: "{q}" ---')
    t0 = time.time()
    _, o, e = ssh.exec_command(
        f'/opt/blossom/web/venv/bin/python -c "'
        f'import sys; sys.path.insert(0, \\"/opt/blossom/web\\"); '
        f'from run import app; '
        f'c = app.test_client(); '
        f'c.post(\\"/api/auth/login\\", json={{\\"emp_no\\":\\"admin\\",\\"password\\":\\"admin\\"}}); '
        f'r = c.get(\\"/api/unified-search?q={q}\\"); '
        f'd = r.get_json(); '
        f'rag = d.get(\\"rag_answer\\", {{}}); '
        f'print(\\"method:\\", rag.get(\\"method\\", \\"none\\")); '
        f'print(\\"answer:\\", (rag.get(\\"answer_text\\", \\"\\") or \\"\\")[:300]); '
        f'print(\\"sources:\\", len(rag.get(\\"sources\\", []))); '
        f'"',
        timeout=180
    )
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    elapsed = time.time() - t0
    print(f'Time: {elapsed:.1f}s')
    if out:
        for line in out.split('\n'):
            print(f'  {line}')
    if 'Error' in err or 'Traceback' in err:
        # Show last few error lines
        for line in err.split('\n')[-5:]:
            if line.strip():
                print(f'  ERR: {line.strip()}')

ssh.close()
print('\n[DONE]')
