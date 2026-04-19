"""Full response dump for RAG search"""
import paramiko, json, time
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Login
_, o, _ = ssh.exec_command(
    'curl -s -c /tmp/bc_f2.txt -X POST http://localhost:8001/login '
    '-d "employee_id=admin&password=admin1234!" '
    '-H "Content-Type: application/x-www-form-urlencoded" '
    '-o /dev/null -L',
    timeout=10
)
o.read()

# Search with full response
print('Search "인공지능 트렌드"...')
t0 = time.time()
_, o, _ = ssh.exec_command(
    "curl -s -b /tmp/bc_f2.txt -X POST http://localhost:8001/api/search/unified "
    "-H 'Content-Type: application/json' "
    "-H 'X-Requested-With: XMLHttpRequest' "
    """-d '{"q":"인공지능 트렌드","limit":5}' """,
    timeout=200
)
resp = o.read().decode().strip()
elapsed = time.time() - t0
print(f'Time: {elapsed:.1f}s')

try:
    d = json.loads(resp)
    # Print all top-level keys
    print(f'Keys: {list(d.keys())}')
    print(f'success: {d.get("success")}')
    print(f'total: {d.get("total")}')
    
    # Check rag-related keys
    for k in ['rag', 'rag_answer', 'answer', 'method', 'rag_sources', 'sources', 'briefing']:
        v = d.get(k)
        if v is not None:
            if isinstance(v, dict):
                print(f'{k}: {json.dumps(v, ensure_ascii=False)[:400]}')
            elif isinstance(v, list):
                print(f'{k}: [{len(v)} items]')
            else:
                s = str(v)
                print(f'{k}: {s[:300]}')
except Exception as ex:
    print(f'Error: {ex}')
    print(f'Raw: {resp[:1000]}')

ssh.close()
