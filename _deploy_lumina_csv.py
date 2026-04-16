#!/usr/bin/env python3
"""Deploy CSV icon + updated code to Lumina remote server."""
import paramiko, os

HOST = '192.168.56.108'
ROOT = os.path.dirname(os.path.abspath(__file__))

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=22, username='root', password='123456', timeout=10)
sftp = ssh.open_sftp()

# 1. Upload CSV SVG
local_svg = os.path.join(ROOT, 'static', 'image', 'svg', 'lumina', 'free-icon-font-file-csv.svg')
remote_svg = '/opt/blossom/lumina/web/app/static/image/svg/lumina/free-icon-font-file-csv.svg'
print('[1] Uploading CSV SVG icon...')
sftp.put(local_svg, remote_svg)
print('    OK')

# 2. Upload updated app code
local_app = os.path.join(ROOT, 'agents', 'web', 'app_factory.py')
remote_app = '/opt/blossom/lumina/web/app/__init__.py'
print('[2] Uploading app code...')
sftp.put(local_app, remote_app)
print('    OK')
sftp.close()

# 3. Verify + restart
_, o, _ = ssh.exec_command('curl -kso /dev/null -w "%{http_code}" https://127.0.0.1:9601/static/image/svg/lumina/free-icon-font-file-csv.svg')
print(f'[3] CSV SVG HTTP: {o.read().decode().strip()}')

_, o, e = ssh.exec_command('systemctl restart lumina-web')
rc = o.channel.recv_exit_status()
print(f'[4] Restart: {"SUCCESS" if rc == 0 else "FAILED"}')

_, o, _ = ssh.exec_command('systemctl is-active lumina-web')
print(f'    Service: {o.read().decode().strip()}')

ssh.close()
print('DONE')
