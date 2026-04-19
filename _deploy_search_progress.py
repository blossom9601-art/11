"""Deploy search progress indicator"""
import paramiko, re

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

files = [
    ('static/js/addon_application/5.search.js', '/opt/blossom/web/static/js/addon_application/5.search.js'),
    ('static/css/blossom.css', '/opt/blossom/web/static/css/blossom.css'),
]

for local, remote in files:
    sftp.put(local, remote)
    print(f'Deployed: {remote}')

sftp.close()

# Bump JS version in search HTML
_, o, _ = ssh.exec_command('cat /opt/blossom/web/app/templates/addon_application/5.search.html')
html = o.read().decode()
print(f'HTML length: {len(html)}')

# Restart service
_, o, _ = ssh.exec_command('systemctl restart blossom-web')
o.read()

import time; time.sleep(3)
_, o, _ = ssh.exec_command('systemctl is-active blossom-web')
print(f'Service: {o.read().decode().strip()}')

ssh.close()
print('[DONE]')
