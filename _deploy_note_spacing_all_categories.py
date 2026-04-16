import paramiko
from pathlib import Path

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

files = [
    (
        'static/css/category2.css',
        '/opt/blossom/web/static/css/category2.css'
    ),
]

# Include all changed category list templates in requested scope
for p in Path('app/templates/9.category').rglob('1.*_list.html'):
    s = str(p).replace('\\', '/')
    if any(seg in s for seg in [
        '/9-2.hardware/',
        '/9-3.software/',
        '/9-4.component/',
        '/9-5.company/',
        '/9-6.customer/',
        '/9-7.vendor/',
    ]):
        files.append((s, '/opt/blossom/web/' + s))

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

sftp = ssh.open_sftp()
for local_path, remote_path in files:
    sftp.put(local_path, remote_path)
print(f'uploaded={len(files)}')
sftp.close()

ssh.exec_command('systemctl restart blossom-web')
_, out, _ = ssh.exec_command('sleep 2; systemctl is-active blossom-web')
print('service=' + out.read().decode().strip())

_, out, _ = ssh.exec_command("grep -n 'form-section:last-child' /opt/blossom/web/static/css/category2.css")
print('css_marker=')
print(out.read().decode().strip())

_, out, _ = ssh.exec_command("grep -n 'category2.css?v=20260414e' /opt/blossom/web/app/templates/9.category/9-2.hardware/9-2-1.server/1.server_list.html")
print('html_marker=')
print(out.read().decode().strip())

ssh.close()
print('DONE')
