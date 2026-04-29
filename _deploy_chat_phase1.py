"""Deploy chat Phase 1 (Stages 1-5) to production."""
import paramiko, os, sys

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

deploy_files = [
    'app/models.py',
    'app/services/chat_service.py',
    'app/routes/api.py',
    'app/routes/main.py',
    'app/templates/addon_application/3.chat.html',
    'static/css/addon_application.css',
    'static/js/addon_application/3.chat.js',
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=20)
sftp = ssh.open_sftp()

errors = []
for f in deploy_files:
    local = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    remote = f'{REMOTE_BASE}/{f}'
    if not os.path.exists(local):
        print(f'[MISS] {f}')
        errors.append(f)
        continue
    # 백업
    ssh.exec_command(f'cp -f {remote} {remote}.bak.chat-phase1 2>/dev/null')
    # 원격 디렉터리 보장
    rdir = os.path.dirname(remote)
    ssh.exec_command(f'mkdir -p {rdir}')
    sftp.put(local, remote)
    local_size = os.path.getsize(local)
    remote_size = sftp.stat(remote).st_size
    status = 'OK' if local_size == remote_size else 'SIZE-MISMATCH'
    if status != 'OK':
        errors.append(f)
    print(f'[{status}] {f}: local={local_size}, remote={remote_size}')

sftp.close()

print('\n[restart] blossom-web ...')
stdin, stdout, stderr = ssh.exec_command('systemctl restart blossom-web.service && sleep 1 && systemctl is-active blossom-web.service')
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
print('  status:', out or '(empty)')
if err:
    print('  stderr:', err)

# 헬스 체크
stdin, stdout, stderr = ssh.exec_command('curl -sk -o /dev/null -w "%{http_code}" https://localhost/login')
print('  /login http:', stdout.read().decode().strip())

ssh.close()
if errors:
    print('\nFAILED:', errors)
    sys.exit(1)
print('\nDONE')
