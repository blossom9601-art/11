"""qwen2.5:1.5b 전환 배포 + 웜업 + 검증"""
import paramiko, time, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

# 1. Deploy
for local, remote in [
    ('config.py', '/opt/blossom/web/config.py'),
    ('app/services/ollama_service.py', '/opt/blossom/web/app/services/ollama_service.py'),
]:
    sftp.put(local, remote)
    print(f'Deployed: {remote}')
sftp.close()

# 2. Restart
print('\nRestarting blossom-web...')
_, o, _ = ssh.exec_command('systemctl restart blossom-web')
o.read()
time.sleep(3)
_, o, _ = ssh.exec_command('systemctl is-active blossom-web')
print(f'Service: {o.read().decode().strip()}')

# 3. Warmup qwen2.5:1.5b
print('\n[1] Warming up qwen2.5:1.5b (first load)...')
t0 = time.time()
_, o, e = ssh.exec_command(
    "curl -s http://localhost:11434/api/chat "
    "-d '{\"model\":\"qwen2.5:1.5b\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}],\"stream\":false,\"options\":{\"num_predict\":5}}'",
    timeout=120
)
out = o.read().decode().strip()
elapsed = time.time() - t0
print(f'Warmup done in {elapsed:.1f}s')
if out:
    try:
        d = json.loads(out)
        print(f'Response: {d.get("message",{}).get("content","N/A")}')
        dur_ns = d.get('total_duration', 0)
        print(f'Total duration: {dur_ns/1e9:.1f}s')
    except:
        print(f'Raw: {out[:200]}')

# 4. Korean test (warm model now)
print('\n[2] Korean RAG-style test...')
t0 = time.time()
_, o, e = ssh.exec_command(
    """curl -s http://localhost:11434/api/chat -d '{"model":"qwen2.5:1.5b","messages":[{"role":"system","content":"당신은 IT 자산관리 시스템의 AI 어시스턴트입니다. 한국어로 답변하세요."},{"role":"user","content":"AI란 무엇인가요? 2문장으로 답해주세요."}],"stream":false,"options":{"num_predict":100}}'""",
    timeout=120
)
out = o.read().decode().strip()
elapsed = time.time() - t0
print(f'Done in {elapsed:.1f}s')
if out:
    try:
        d = json.loads(out)
        print(f'Answer: {d.get("message",{}).get("content","N/A")}')
        dur_ns = d.get('total_duration', 0)
        print(f'Total duration: {dur_ns/1e9:.1f}s')
    except:
        print(f'Raw: {out[:300]}')

# 5. Memory
_, o, _ = ssh.exec_command('free -h | head -3')
print(f'\nMemory:\n{o.read().decode().strip()}')

# 6. Running models
_, o, _ = ssh.exec_command('curl -s http://localhost:11434/api/ps')
print(f'\nRunning models: {o.read().decode().strip()[:300]}')

ssh.close()
print('\n[DONE]')
