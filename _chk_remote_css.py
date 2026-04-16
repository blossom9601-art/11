import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=5)
_, so, _ = ssh.exec_command('grep category2 /opt/blossom/web/app/templates/9.category/9-1.business/9-1-3.work_status/1.work_status_list.html', timeout=10)
print('HTML version:', so.read().decode().strip())
ssh.close()
