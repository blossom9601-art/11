import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

sftp = ssh.open_sftp()
sftp.put('static/css/category2.css', '/opt/blossom/web/static/css/category2.css')
print('CSS deployed')
sftp.close()

_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
o.read()
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
print('service:', o.read().decode().strip())

# Verify
_, o, _ = ssh.exec_command('grep -n form-row-wide /opt/blossom/web/static/css/category2.css')
print(o.read().decode().strip())

ssh.close()
print('DONE')
