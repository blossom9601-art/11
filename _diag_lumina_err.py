import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

_, o, _ = ssh.exec_command('journalctl -u lumina-web --since "2 minutes ago" --no-pager', timeout=5)
print(o.read().decode()[-3000:])

ssh.close()
