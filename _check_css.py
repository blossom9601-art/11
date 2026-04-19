import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

cmds = [
    ('all empty rules', 'grep -n "blog-add-editor.*empty" /opt/blossom/web/static/css/insight.css'),
    ('L1078-1090', 'sed -n "1078,1090p" /opt/blossom/web/static/css/insight.css'),
    ('L738-748', 'sed -n "738,748p" /opt/blossom/web/static/css/insight.css'),
    ('L1188-1201', 'sed -n "1188,1205p" /opt/blossom/web/static/css/insight.css'),
]

for label, cmd in cmds:
    _, o, e = s.exec_command(cmd)
    print(f'=== {label} ===')
    print(o.read().decode().strip())
    print()

s.close()
