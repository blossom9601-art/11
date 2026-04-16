import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

sftp = ssh.open_sftp()
sftp.put('static/css/category2.css', '/opt/blossom/web/static/css/category2.css')
sftp.close()
print('CSS deployed')

_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
o.read()
_, o, _ = ssh.exec_command('sleep 2; systemctl is-active blossom-web', timeout=5)
print('service:', o.read().decode().strip())

# Verify the exact CSS served
_, o, _ = ssh.exec_command('curl -sk https://127.0.0.1/static/css/category2.css?v=20260412 2>/dev/null | grep -A10 "form-row-wide"')
print('\nServed CSS:')
print(o.read().decode().strip())

ssh.close()
print('DONE')
