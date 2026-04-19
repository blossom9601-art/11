import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

cmds = [
    ('before', 'ls -la /opt/blossom/web/instance/rag_index.db'),
    ('fix perms', 'chmod 666 /opt/blossom/web/instance/rag_index.db'),
    ('fix dir', 'chmod 777 /opt/blossom/web/instance/'),
    ('after', 'ls -la /opt/blossom/web/instance/rag_index.db'),
    ('restart', 'systemctl restart blossom-web'),
    ('status', 'systemctl is-active blossom-web'),
]

for label, cmd in cmds:
    _, o, e = s.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    print(f'{label}: {out or err or "ok"}')

s.close()
