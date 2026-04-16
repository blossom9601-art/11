#!/usr/bin/env python3
"""Deploy SVG icons + updated app_factory.py to Lumina remote server."""
import paramiko
import os

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
ROOT = os.path.dirname(os.path.abspath(__file__))

# nginx serves from /opt/blossom/lumina/web/app/static/
REMOTE_STATIC = '/opt/blossom/lumina/web/app/static'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=22, username=USER, password=PASS, timeout=10)
sftp = ssh.open_sftp()

# 1. Create remote SVG directory
remote_svg_dir = f'{REMOTE_STATIC}/image/svg/lumina'
print(f'[1] Creating directory: {remote_svg_dir}')
ssh.exec_command(f'mkdir -p {remote_svg_dir}')
# wait for it
import time
time.sleep(0.5)

# 2. Upload all SVG files
svg_files = [
    'free-icon-font-star.svg',
    'free-icon-font-map-marker-check.svg',
    'free-icon-font-comment-xmark.svg',
    'free-icon-font-refresh.svg',
    'free-icon-font-handshake.svg',
    'free-icon-font-trash.svg',
]
local_svg_dir = os.path.join(ROOT, 'static', 'image', 'svg', 'lumina')

for svg in svg_files:
    local_path = os.path.join(local_svg_dir, svg)
    remote_path = f'{remote_svg_dir}/{svg}'
    print(f'[2] Uploading: {svg}')
    sftp.put(local_path, remote_path)

print('    All SVGs uploaded')

# 3. Upload updated app_factory.py as __init__.py
local_app = os.path.join(ROOT, 'agents', 'web', 'app_factory.py')
remote_app = '/opt/blossom/lumina/web/app/__init__.py'
print(f'[3] Uploading app code: -> {remote_app}')
sftp.put(local_app, remote_app)
print('    OK')

sftp.close()

# 4. Verify
print()
print('[4] Verifying...')
_, o, _ = ssh.exec_command(f'ls -la {remote_svg_dir}/')
print(o.read().decode('utf-8', 'replace'))

_, o, _ = ssh.exec_command('grep -c "integration-icon" /opt/blossom/lumina/web/app/__init__.py')
print(f'    integration-icon count: {o.read().decode().strip()}')

_, o, _ = ssh.exec_command('grep -c "btn-remove" /opt/blossom/lumina/web/app/__init__.py')
print(f'    btn-remove count: {o.read().decode().strip()}')

# 5. Test SVG served via nginx
for svg in svg_files:
    _, o, _ = ssh.exec_command(f'curl -kso /dev/null -w "%{{http_code}}" https://127.0.0.1:9601/static/image/svg/lumina/{svg}')
    code = o.read().decode().strip()
    status = 'OK' if code == '200' else 'FAIL'
    print(f'    {svg}: {code} {status}')

# 6. Restart
print()
print('[5] Restarting lumina-web...')
_, o, e = ssh.exec_command('systemctl restart lumina-web')
rc = o.channel.recv_exit_status()
if rc == 0:
    print('    Restart SUCCESS')
else:
    print(f'    Restart FAILED (rc={rc})')
    print('    ', e.read().decode('utf-8', 'replace'))

# 7. Status
_, o, _ = ssh.exec_command('systemctl is-active lumina-web')
print(f'    Service: {o.read().decode().strip()}')

ssh.close()
print()
print('DEPLOY COMPLETE')
