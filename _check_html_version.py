import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check the HTML on server
_, o, _ = ssh.exec_command('grep category2.css /opt/blossom/web/app/templates/9.category/9-1.business/9-1-1.work_classification/1.work_classification_list.html')
html_version = o.read().decode().strip()
print('HTML CSS version on server:')
print(html_version)

ssh.close()
