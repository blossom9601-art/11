#!/usr/bin/env python3
"""Deploy favicon + updated app_factory.py to Lumina remote server."""
import paramiko
import os

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
ROOT = os.path.dirname(os.path.abspath(__file__))

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=22, username=USER, password=PASS, timeout=10)
sftp = ssh.open_sftp()

# 1. Upload free-icon-letter-L.svg favicon (both static paths)
local_ico = os.path.join(ROOT, 'static', 'image', 'svg', 'lumina', 'free-icon-letter-L.svg')
for remote_svg_dir in [
    '/opt/blossom/lumina/web/static/image/svg/lumina',
    '/opt/blossom/lumina/web/app/static/image/svg/lumina',
]:
    ssh.exec_command(f'mkdir -p {remote_svg_dir}')
    remote_ico = f'{remote_svg_dir}/free-icon-letter-L.svg'
    print(f'[1] Uploading favicon: {local_ico} -> {remote_ico}')
    sftp.put(local_ico, remote_ico)
    ssh.exec_command(f'chmod 644 {remote_ico}')
    print('    OK')

# 2. Upload updated app_factory.py as __init__.py
local_app = os.path.join(ROOT, 'agents', 'web', 'app_factory.py')
remote_app = '/opt/blossom/lumina/web/app/__init__.py'
print(f'[2] Uploading app code: {local_app} -> {remote_app}')
sftp.put(local_app, remote_app)
ssh.exec_command(f'chmod 644 {remote_app}')
print('    OK')

sftp.close()

# 3. Verify files
print()
print('[3] Verifying deployed files...')
_, o, _ = ssh.exec_command('ls -la /opt/blossom/lumina/web/static/image/svg/lumina/')
print(o.read().decode('utf-8', 'replace'))

_, o, _ = ssh.exec_command('grep -c "btn-remove" /opt/blossom/lumina/web/app/__init__.py')
cnt = o.read().decode('utf-8', 'replace').strip()
print(f'    btn-remove count in __init__.py: {cnt}')

_, o, _ = ssh.exec_command('grep -c "free-icon-letter-L" /opt/blossom/lumina/web/app/__init__.py')
cnt2 = o.read().decode('utf-8', 'replace').strip()
print(f'    free-icon-letter-L count in __init__.py: {cnt2}')

# 4. Restart lumina-web
print()
print('[4] Restarting lumina-web...')
_, o, e = ssh.exec_command('systemctl restart lumina-web')
rc = o.channel.recv_exit_status()
if rc == 0:
    print('    Restart SUCCESS')
else:
    print(f'    Restart FAILED (rc={rc})')
    print('    ', e.read().decode('utf-8', 'replace'))

# 5. Check status
print()
print('[5] Service status:')
_, o, _ = ssh.exec_command('systemctl status lumina-web --no-pager -l')
print(o.read().decode('utf-8', 'replace'))

ssh.close()
print('DEPLOY COMPLETE')
