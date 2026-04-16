import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check service status
print("=== Service Status ===")
_, o, _ = ssh.exec_command("systemctl status blossom-web --no-pager -l | head -20", timeout=10)
print(o.read().decode())

# Check journal for errors
print("=== Recent Logs ===")
_, o, _ = ssh.exec_command("journalctl -u blossom-web --no-pager -n 30", timeout=10)
print(o.read().decode()[-3000:])

# Try curl from inside
print("=== Internal curl ===")
_, o, e = ssh.exec_command("curl -sk -o /dev/null -w '%{http_code}' --max-time 30 https://127.0.0.1/login", timeout=35)
print("Status:", o.read().decode())
print(e.read().decode()[:200])

ssh.close()
