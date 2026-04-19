import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE = '/opt/blossom/web'

files = [
    ('static/css/version.css', 'static/css/version.css'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html'),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()
for local, remote in files:
    sftp.put(local, f'{REMOTE}/{remote}')
    print(f'  uploaded {local}')
sftp.close()

for cmd in [
    'rm -rf /var/cache/nginx/blossom_proxy/* 2>/dev/null; echo CACHE_CLEARED',
    'systemctl reload nginx && echo NGINX_RELOADED',
]:
    _, out, _ = ssh.exec_command(cmd)
    print(out.read().decode().strip())

ssh.close()
print('Done.')
