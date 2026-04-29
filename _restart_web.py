import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'systemctl restart lumina-web.service',
    'sleep 3 && systemctl is-active lumina-web.service',
    'sleep 1 && ps -ef | grep gunicorn | grep -v grep | head -n 5',
    'curl -s -o /dev/null -w "blossom-8000:%{http_code}\\n" http://127.0.0.1:8000/api/auth/session-check',
    'curl -s -o /dev/null -w "lumina-8001:%{http_code}\\n" http://127.0.0.1:8001/api/auth/session-check',
    'grep -n "_room_lifecycle_ensure_schema" /opt/blossom/web/app/routes/api.py | head -n 5',
    'grep -n "begin_nested" /opt/blossom/web/app/routes/api.py | head -n 10',
]
for cmd in cmds:
    print('== ' + cmd)
    _, o, e = ssh.exec_command(cmd, timeout=20)
    out = o.read().decode(errors='replace')
    err = e.read().decode(errors='replace')
    if out.strip(): print(out.rstrip())
    if err.strip(): print('STDERR:', err.rstrip())
    print()
ssh.close()
