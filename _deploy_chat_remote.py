import paramiko
import pathlib

host='192.168.56.108'
user='root'
pw='123456'

ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)

sftp=ssh.open_sftp()

# Files to deploy
files=[
    (r'app/__init__.py', '/opt/blossom/web/app/__init__.py'),
    (r'app/routes/main.py', '/opt/blossom/web/app/routes/main.py'),
    (r'app/routes/api.py', '/opt/blossom/web/app/routes/api.py'),
    (r'app/templates/addon_application/3.chat.html', '/opt/blossom/web/app/templates/addon_application/3.chat.html'),
    (r'static/js/addon_application/3.chat.js', '/opt/blossom/web/static/js/addon_application/3.chat.js'),
]

print('📤 Uploading files to 192.168.56.108...')
for local_rel, remote_path in files:
    local_abs = str(pathlib.Path(local_rel).resolve())
    sftp.put(local_abs, remote_path)
    print(f'  ✓ {local_rel}')

sftp.close()

# Restart service and verify
cmds=[
    'systemctl restart blossom-web',
    'sleep 3',
    'systemctl is-active blossom-web',
]

print('\n🔄 Restarting blossom-web service...')
for cmd in cmds:
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=20)
    out = stdout.read().decode('utf-8', 'ignore').strip()
    if out:
        print(f'  {out}')

ssh.close()
print('\n✅ 배포 완료!')
