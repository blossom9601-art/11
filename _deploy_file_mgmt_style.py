import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

sftp = ssh.open_sftp()

# 1) CSS
sftp.put(
    'static/css/file_management_settings.css',
    '/opt/blossom/web/static/css/file_management_settings.css',
)
print('[1/3] CSS deployed')

# 2) HTML template
sftp.put(
    'app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html',
    '/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html',
)
print('[2/3] HTML deployed')

# 3) JS
sftp.put(
    'static/js/authentication/11-3.admin/11-3-3.setting/11.file_management.js',
    '/opt/blossom/web/static/js/authentication/11-3.admin/11-3-3.setting/11.file_management.js',
)
print('[3/3] JS deployed')

sftp.close()

# Restart service
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
o.read()
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
print('service:', o.read().decode().strip())

ssh.close()
print('DONE')
