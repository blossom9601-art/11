import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'cat /etc/nginx/conf.d/blossom-lumina.conf',
    'ls -la /opt/blossom/web/static/css/category2.css 2>/dev/null',
    'ls -la /opt/blossom/lumina/web/static/css/ 2>/dev/null | head -20',
]
for cmd in cmds:
    print('=== ' + cmd[:70] + ' ===')
    _, o, e = ssh.exec_command(cmd, timeout=15)
    print(o.read().decode('utf-8', 'replace')[:2000])
    print()

ssh.close()
print('DONE')
