"""Curl login + search with proper timeout"""
import paramiko, json, time
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Login
print('Logging in...')
_, o, _ = ssh.exec_command(
    'curl -s -c /tmp/bc_final.txt -X POST http://localhost:8001/login '
    '-d "employee_id=admin&password=admin1234!" '
    '-H "Content-Type: application/x-www-form-urlencoded" '
    '-o /dev/null -w "%{http_code}" -L',
    timeout=10
)
code = o.read().decode().strip()
print(f'Login HTTP: {code}')

# Verify cookie exists
_, o, _ = ssh.exec_command('cat /tmp/bc_final.txt | grep session')
cookie = o.read().decode().strip()
print(f'Cookie: {"YES" if cookie else "NO"}')

# Search - short query, no LLM expected for "test"
print('\nSearch "test" (no RAG)...')
t0 = time.time()
_, o, _ = ssh.exec_command(
    "curl -s -b /tmp/bc_final.txt -X POST http://localhost:8001/api/search/unified "
    "-H 'Content-Type: application/json' "
    "-H 'X-Requested-With: XMLHttpRequest' "
    """-d '{"q":"test","limit":5}' """,
    timeout=30
)
resp = o.read().decode().strip()
print(f'Time: {time.time()-t0:.1f}s')
try:
    d = json.loads(resp)
    print(f'success: {d.get("success")}')
    print(f'total: {d.get("total", 0)}')
    print(f'method: {d.get("method", "N/A")}')
except:
    print(f'Raw: {resp[:300]}')

# Search with RAG query
print('\nSearch "AI 시장 전망" (RAG expected)...')
t0 = time.time()
_, o, _ = ssh.exec_command(
    "curl -s -b /tmp/bc_final.txt -X POST http://localhost:8001/api/search/unified "
    "-H 'Content-Type: application/json' "
    "-H 'X-Requested-With: XMLHttpRequest' "
    """-d '{"q":"AI 시장 전망","limit":5}' """,
    timeout=200
)
resp = o.read().decode().strip()
elapsed = time.time() - t0
print(f'Time: {elapsed:.1f}s')
try:
    d = json.loads(resp)
    print(f'success: {d.get("success")}')
    print(f'total: {d.get("total", 0)}')
    print(f'method: {d.get("method", "N/A")}')
    ans = d.get('rag_answer', d.get('answer', ''))
    if ans:
        print(f'answer: {ans[:300]}')
    sources = d.get('rag_sources', d.get('sources', []))
    print(f'sources: {len(sources) if isinstance(sources, list) else sources}')
except Exception as ex:
    print(f'Parse error: {ex}')
    print(f'Raw: {resp[:500]}')

ssh.close()
print('\n[DONE]')
