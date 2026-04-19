"""배포 + 웜업 + E2E 검증 (한 스크립트)"""
import paramiko, time, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

# 1. Deploy
for local, remote in [
    ('config.py', '/opt/blossom/web/config.py'),
    ('app/services/ollama_service.py', '/opt/blossom/web/app/services/ollama_service.py'),
    ('app/__init__.py', '/opt/blossom/web/app/__init__.py'),
]:
    sftp.put(local, remote)
    print(f'Deployed: {remote}')
sftp.close()

# 2. Restart
print('\nRestarting blossom-web...')
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
try: o.read()
except: pass
time.sleep(3)

_, o, _ = ssh.exec_command('systemctl is-active blossom-web')
print(f'Service: {o.read().decode().strip()}')

# 3. Warmup model (wait for completion before testing)
print('\nWarming up model (waiting for completion)...')
t0 = time.time()
_, o, e = ssh.exec_command(
    """curl -s http://localhost:11434/api/chat -d '{"model":"qwen2.5:1.5b","messages":[{"role":"user","content":"hi"}],"stream":false,"keep_alive":"30m","options":{"num_predict":1}}'""",
    timeout=120
)
out = o.read().decode().strip()
elapsed = time.time() - t0
print(f'Warmup complete in {elapsed:.1f}s')

# 4. Check model loaded
_, o, _ = ssh.exec_command('curl -s http://localhost:11434/api/ps')
ps = json.loads(o.read().decode().strip())
for m in ps.get('models', []):
    print(f'  Model: {m["name"]}, size: {m["size"]//1024//1024}MB')

# 5. E2E test via _verify_qwen.py
print('\n=== E2E LLM RAG Test ===')
_, o, e = ssh.exec_command(
    '/opt/blossom/web/venv/bin/python /opt/blossom/web/_verify_qwen.py 2>&1',
    timeout=600
)
out = o.read().decode()
for line in out.split('\n'):
    s = line.strip()
    if s.startswith('[') and ('time=' in s or 'method=' in s):
        print(s)
    elif s.startswith('->') or s.startswith('  ->'):
        print(s[:200])

ssh.close()
print('\n[DONE]')
