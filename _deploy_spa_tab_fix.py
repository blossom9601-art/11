"""Deploy SPA tab data-attr sync fix to production."""
import paramiko, os

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'

files = [
    ('static/js/blossom.js', f'{REMOTE_BASE}/static/js/blossom.js'),
    ('app/templates/layouts/layout.html', f'{REMOTE_BASE}/app/templates/layouts/layout.html'),
    ('app/templates/layouts/header.html', f'{REMOTE_BASE}/app/templates/layouts/header.html'),
    ('app/templates/common/dynamic_tab_placeholder.html', f'{REMOTE_BASE}/app/templates/common/dynamic_tab_placeholder.html'),
]

LOCAL_BASE = r'c:\Users\ME\Desktop\blossom'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()

for local_rel, remote_path in files:
    local_path = os.path.join(LOCAL_BASE, local_rel)
    print(f'  {local_rel} -> {remote_path}')
    sftp.put(local_path, remote_path)

sftp.close()

# Restart service
stdin, stdout, stderr = ssh.exec_command('systemctl restart blossom-web')
print(stdout.read().decode())
print(stderr.read().decode())

stdin, stdout, stderr = ssh.exec_command('systemctl is-active blossom-web')
status = stdout.read().decode().strip()
print(f'Service status: {status}')
ssh.close()
print('Deploy complete.')
