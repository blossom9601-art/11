#!/usr/bin/env python3
"""Deploy work dashboard fix to remote server (192.168.56.108)."""
import paramiko, os

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/blossom'
LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'

FILES = [
    # (local_rel_path, remote_rel_path)
    ('static/js/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.js',
     'static/js/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.js'),
    ('app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html',
     'app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html'),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()

for local_rel, remote_rel in FILES:
    local_path = os.path.join(LOCAL_BASE, local_rel)
    remote_path = f'{REMOTE_BASE}/{remote_rel}'
    # Ensure remote directory exists
    remote_dir = os.path.dirname(remote_path).replace('\\', '/')
    ssh.exec_command(f'mkdir -p {remote_dir}')
    sftp.put(local_path, remote_path)
    print(f'  OK  {remote_path}')

# Restart Blossom service
stdin, stdout, stderr = ssh.exec_command('systemctl restart blossom 2>&1 || echo "no blossom service"')
result = stdout.read().decode().strip()
print(f'restart: {result if result else "OK"}')

sftp.close()
ssh.close()
print('Done.')
