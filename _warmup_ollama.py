import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Warm up model
print('[1] Warming up gemma3:4b...')
_, o, e = ssh.exec_command(
    """curl -s http://localhost:11434/api/chat -d '{"model":"gemma3:4b","messages":[{"role":"user","content":"hello"}],"stream":false,"options":{"num_predict":5}}'""",
    timeout=300
)
out = o.read().decode().strip()
print('Response:', out[:200] if out else '(empty)')
err = e.read().decode().strip()
if err:
    print('Err:', err[:200])

# 2. Memory check
_, o, _ = ssh.exec_command('free -h | head -3')
print('\nMemory:', o.read().decode().strip())

# 3. Quick LLM test
print('\n[2] LLM Korean test...')
_, o, e = ssh.exec_command(
    """curl -s http://localhost:11434/api/chat -d '{"model":"gemma3:4b","messages":[{"role":"user","content":"AI란 무엇인가요? 한국어로 2문장으로 답해주세요."}],"stream":false,"options":{"num_predict":100}}'""",
    timeout=180
)
out = o.read().decode().strip()
err = e.read().decode().strip()
if out:
    import json
    try:
        d = json.loads(out)
        print('Answer:', d.get('message', {}).get('content', 'N/A'))
    except:
        print('Raw:', out[:300])
if err:
    print('Err:', err[:200])

ssh.close()
print('\n[DONE]')
