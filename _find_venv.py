import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

# Find python in venv
cmds = [
    'ls /opt/blossom/web/.venv/bin/ 2>&1 | head -20',
    'which python3',
    'ls /opt/blossom/web/venv/bin/ 2>&1 | head -10',
    'cat /opt/blossom/web/blossom-web.service 2>/dev/null || cat /etc/systemd/system/blossom-web.service 2>/dev/null | head -20',
]

for cmd in cmds:
    _, o, e = s.exec_command(cmd)
    print(f'$ {cmd}')
    print(o.read().decode().strip() or e.read().decode().strip() or '(empty)')
    print()

s.close()
