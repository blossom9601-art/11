"""Gunicorn timeout 변경 + 서비스 재시작"""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Update gunicorn timeout
_, o, _ = ssh.exec_command("sed -i 's/timeout = 120/timeout = 200/' /opt/blossom/web/gunicorn_blossom.conf.py")
o.read()

# Verify
_, o, _ = ssh.exec_command('grep timeout /opt/blossom/web/gunicorn_blossom.conf.py')
print('Gunicorn config:', o.read().decode().strip())

# Restart
print('Restarting...')
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
try: o.read()
except: pass
time.sleep(4)

_, o, _ = ssh.exec_command('systemctl is-active blossom-web')
print('Service:', o.read().decode().strip())

# Warmup model
print('Warming up model...')
_, o, _ = ssh.exec_command(
    "curl -s http://localhost:11434/api/chat "
    "-d '{\"model\":\"qwen2.5:1.5b\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":false,\"keep_alive\":\"30m\",\"options\":{\"num_predict\":1}}'",
    timeout=120
)
o.read()
print('Model warm.')

ssh.close()
print('[DONE]')
