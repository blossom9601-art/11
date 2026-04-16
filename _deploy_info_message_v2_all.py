from pathlib import Path
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)
sftp = ssh.open_sftp()

# Upload new JS file
js_local = Path('static/js/common/info-message-v2.js')
js_remote = '/opt/blossom/web/static/js/common/info-message-v2.js'
sftp.put(str(js_local), js_remote)
print('[upload] info-message-v2.js')

# Upload all templates referencing v2
root = Path('app/templates')
needle = '/static/js/common/info-message-v2.js?v=20260413e'
changed = []
for p in root.rglob('*.html'):
    txt = p.read_text(encoding='utf-8')
    if needle in txt:
        rel = p.as_posix().replace('app/templates/', '')
        remote = f'/opt/blossom/web/app/templates/{rel}'
        changed.append((p, remote))

for p, remote in changed:
    sftp.put(str(p), remote)

print(f'[upload templates] {len(changed)}')

# quick verify on remote
checks = [
    "grep -R -n '/static/js/common/info-message-v2.js?v=20260413e' /opt/blossom/web/app/templates | wc -l",
    "test -f /opt/blossom/web/static/js/common/info-message-v2.js; echo $?",
    "grep -n 'free-animated-icon-information.json' /opt/blossom/web/static/js/common/info-message-v2.js",
]
for c in checks:
    _, so, se = ssh.exec_command(c, timeout=20)
    print((so.read().decode('utf-8', 'ignore') + se.read().decode('utf-8', 'ignore')).strip() or '(none)')

sftp.close()
ssh.close()
