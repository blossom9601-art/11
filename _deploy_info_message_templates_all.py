from pathlib import Path
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

ROOT = Path('app/templates')
REMOTE_ROOT = '/opt/blossom/web/app/templates'
NEEDLE = '/static/js/common/info-message.js?v=1.0.11'

candidates = []
for path in ROOT.rglob('*.html'):
    text = path.read_text(encoding='utf-8')
    if NEEDLE in text:
        candidates.append(path)

print(f'upload_count={len(candidates)}')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

sftp = ssh.open_sftp()

ensured_dirs = set()

def ensure_remote_dir(remote_dir):
    if remote_dir in ensured_dirs:
        return
    parts = [p for p in remote_dir.split('/') if p]
    cur = ''
    for part in parts:
        cur += '/' + part
        try:
            sftp.stat(cur)
        except Exception:
            sftp.mkdir(cur)
    ensured_dirs.add(remote_dir)

for path in candidates:
    rel = path.as_posix().replace('app/templates/', '')
    remote_path = f'{REMOTE_ROOT}/{rel}'
    remote_dir = remote_path.rsplit('/', 1)[0]
    ensure_remote_dir(remote_dir)
    sftp.put(str(path), remote_path)

sftp.close()

_, so, se = ssh.exec_command("grep -R -n '/static/js/common/info-message.js?v=1.0.4' /opt/blossom/web/app/templates | head -20", timeout=20)
out = so.read().decode('utf-8', 'ignore').strip()
err = se.read().decode('utf-8', 'ignore').strip()
print('[remote old v=1.0.4 sample]')
print(out or '(none)')
if err:
    print('[remote err]')
    print(err)

_, so2, se2 = ssh.exec_command("grep -R -n '/static/js/common/info-message.js?v=1.0.6' /opt/blossom/web/app/templates | wc -l", timeout=20)
print('[remote v=1.0.6 count]')
print((so2.read().decode('utf-8', 'ignore') + se2.read().decode('utf-8', 'ignore')).strip())

ssh.close()
