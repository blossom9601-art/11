"""최종 배포: qwen2.5:1.5b 최적화 + 웜업 + gemma3:4b 제거"""
import paramiko, time, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

# 1. Deploy
files = [
    ('config.py', '/opt/blossom/web/config.py'),
    ('app/services/ollama_service.py', '/opt/blossom/web/app/services/ollama_service.py'),
    ('app/__init__.py', '/opt/blossom/web/app/__init__.py'),
]
for local, remote in files:
    sftp.put(local, remote)
    print(f'Deployed: {remote}')
sftp.close()

# 2. Remove old gemma3:4b model
print('\nRemoving gemma3:4b...')
_, o, e = ssh.exec_command('ollama rm gemma3:4b', timeout=30)
print(o.read().decode().strip())
err = e.read().decode().strip()
if err: print(err[:200])

# Verify models
_, o, _ = ssh.exec_command('ollama list')
print(f'\nModels:\n{o.read().decode().strip()}')

# 3. Restart
print('\nRestarting blossom-web...')
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
try: o.read()
except: pass
time.sleep(5)

_, o, _ = ssh.exec_command('systemctl is-active blossom-web')
print(f'Service: {o.read().decode().strip()}')

# 4. Wait for warmup to complete
print('\nWaiting for model warmup...')
time.sleep(10)

# Check if model loaded
_, o, _ = ssh.exec_command('curl -s http://localhost:11434/api/ps')
ps = o.read().decode().strip()
print(f'Running models: {ps[:200]}')

# 5. Memory
_, o, _ = ssh.exec_command('free -h | head -3')
print(f'\nMemory:\n{o.read().decode().strip()}')

ssh.close()
print('\n[DONE]')
