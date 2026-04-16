import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=5)
_, so, _ = ssh.exec_command('grep -n wc_name /opt/blossom/web/static/css/category2.css', timeout=10)
print(so.read().decode())
_, so, _ = ssh.exec_command('grep -c font-weight /opt/blossom/web/static/css/category2.css', timeout=10)
print('font-weight lines:', so.read().decode().strip())
ssh.close()
