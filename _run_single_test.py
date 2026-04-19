"""모델 웜업 후 단일 쿼리 E2E 테스트"""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()
sftp.put('_server_single_query.py', '/opt/blossom/web/_single_query.py')
sftp.close()

# Ensure model is warm
print('Ensuring model is warm...')
_, o, _ = ssh.exec_command(
    "curl -s http://localhost:11434/api/chat "
    "-d '{\"model\":\"qwen2.5:1.5b\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":false,\"keep_alive\":\"30m\",\"options\":{\"num_predict\":1}}'",
    timeout=120
)
o.read()
print('Model warm.\n')

# Test single query
query = 'AI 시장 전망'
print(f'Testing: "{query}"')
_, o, e = ssh.exec_command(
    f'/opt/blossom/web/venv/bin/python /opt/blossom/web/_single_query.py "{query}" 2>&1',
    timeout=300
)
out = o.read().decode()
for line in out.split('\n'):
    s = line.strip()
    if any(s.startswith(p) for p in ['query=', 'time=', 'method=', 'answer=', 'total=', 'sources=']):
        print(s)

ssh.close()
print('\n[DONE]')
