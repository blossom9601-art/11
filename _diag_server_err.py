import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Get recent error logs
_, o, _ = ssh.exec_command("journalctl -u blossom-web --no-pager -n 50 | grep -i 'error\\|traceback\\|exception\\|500' -A 5", timeout=10)
print(o.read().decode()[-3000:])

print("\n=== FULL RECENT LOGS ===")
_, o, _ = ssh.exec_command("journalctl -u blossom-web --no-pager --since '1 min ago'", timeout=10)
print(o.read().decode()[-3000:])

ssh.close()
