import paramiko, os, time

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

deploy_files = [
    'app/models.py',
    'app/routes/api.py',
    'app/routes/auth.py',
]

for f in deploy_files:
    local = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    remote = f'{REMOTE_BASE}/{f}'
    try:
        ssh.exec_command(f'cp {remote} {remote}.bak.leavefix')
    except Exception:
        pass
    sftp.put(local, remote)
    local_size = os.path.getsize(local)
    remote_stat = sftp.stat(remote)
    match = 'OK' if local_size == remote_stat.st_size else 'FAIL'
    print(f'[{match}] {f}: local={local_size}, remote={remote_stat.st_size}')

sftp.close()

print('Restart lumina-web.service ...')
_, o, e = ssh.exec_command('systemctl restart lumina-web.service')
e.read()
time.sleep(8)
_, o, _ = ssh.exec_command('systemctl is-active lumina-web.service')
print('is-active:', o.read().decode().strip())
_, o, _ = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/api/server-time')
print('server-time HTTP:', o.read().decode())
_, o, _ = ssh.exec_command('grep -c "MsgRoomIdeaLike" /opt/blossom/web/app/models.py')
print('MsgRoomIdeaLike refs in models.py:', o.read().decode().strip())
_, o, _ = ssh.exec_command('grep -c "begin_nested" /opt/blossom/web/app/routes/api.py')
print('begin_nested in api.py:', o.read().decode().strip())
_, o, _ = ssh.exec_command('tail -n 20 /var/log/blossom/web/error.log')
print('--- recent error.log ---')
print(o.read().decode(errors='replace'))
ssh.close()
print('Done.')
