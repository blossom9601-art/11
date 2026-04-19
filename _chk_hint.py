import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

_, o, _ = ssh.exec_command("grep -n 'fullscreen-restore-hint' /opt/blossom/web/static/js/blossom.js")
out = o.read().decode().strip()
print("restore-hint on server:", out or "NOT FOUND")

_, o, _ = ssh.exec_command("grep -c 'fullscreen-restore-hint' /opt/blossom/web/static/js/blossom.js")
print("count:", o.read().decode().strip())

_, o, _ = ssh.exec_command("wc -l /opt/blossom/web/static/js/blossom.js")
print("lines:", o.read().decode().strip())

ssh.close()
