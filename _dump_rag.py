"""Dump rag_answer fully"""
import paramiko, json, time
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Login
_, o, _ = ssh.exec_command(
    'curl -s -c /tmp/bc_d.txt -X POST http://localhost:8001/login '
    '-d "employee_id=admin&password=admin1234!" '
    '-H "Content-Type: application/x-www-form-urlencoded" '
    '-o /dev/null -L',
    timeout=10
)
o.read()

# Search
t0 = time.time()
_, o, _ = ssh.exec_command(
    "curl -s -b /tmp/bc_d.txt -X POST http://localhost:8001/api/search/unified "
    "-H 'Content-Type: application/json' "
    "-H 'X-Requested-With: XMLHttpRequest' "
    """-d '{"q":"인공지능","limit":5}' """,
    timeout=200
)
resp = o.read().decode().strip()
elapsed = time.time() - t0
print(f'Time: {elapsed:.1f}s')

try:
    d = json.loads(resp)
    rag = d.get('rag_answer')
    if rag:
        print(f'rag_answer keys: {list(rag.keys())}')
        print(f'method: {rag.get("method", "MISSING")}')
        print(f'sources: {len(rag.get("sources", []))}')
        ans = rag.get('answer_text', '')
        print(f'answer_text ({len(ans)} chars): {ans[:400]}')
    else:
        print('rag_answer: None')
        print(f'All keys: {list(d.keys())}')
except Exception as ex:
    print(f'Error: {ex}')
    print(f'Raw: {resp[:500]}')

ssh.close()
