import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check if the rule exists
_, o, _ = ssh.exec_command('grep "form-grid + .form-row" /opt/blossom/web/static/css/category2.css')
result = o.read().decode().strip()
print('Margin rule on server:')
print(result if result else 'NOT FOUND - will redeploy')

# Deploy CSS
sftp = ssh.open_sftp()
sftp.put('static/css/category2.css', '/opt/blossom/web/static/css/category2.css')
sftp.close()
print('\nCSS deployed')

# Restart service
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
o.read()
_, o, _ = ssh.exec_command('sleep 2; systemctl is-active blossom-web', timeout=5)
print('Service:', o.read().decode().strip())

# Verify after deploy
_, o, _ = ssh.exec_command('grep "form-grid + .form-row" /opt/blossom/web/static/css/category2.css')
print('\nAfter deploy:', o.read().decode().strip())

ssh.close()
print('DONE')
