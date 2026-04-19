import paramiko, os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

files = [
    ('app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html',
     '/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html'),
    ('static/js/version.js',
     '/opt/blossom/web/static/js/version.js'),
]
for i, (l, r) in enumerate(files, 1):
    sftp.put(l, r)
    print('[%d/%d] %s' % (i, len(files), os.path.basename(l)))
sftp.close()

# nginx cache clear + restart
cmds = [
    'rm -rf /var/cache/nginx/blossom_proxy/* 2>/dev/null',
    'systemctl restart blossom-web',
    'systemctl reload nginx',
]
for c in cmds:
    _, o, e = ssh.exec_command(c, timeout=30)
    o.read()

# verify
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
status = o.read().decode().strip()
print('service: ' + status)

_, o, _ = ssh.exec_command('grep version.js /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html')
print('JS ver: ' + o.read().decode().strip())
_, o, _ = ssh.exec_command('grep -c search-select /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html')
print('search-select: ' + o.read().decode().strip())
_, o, _ = ssh.exec_command('grep -c searchable_select /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html')
print('searchable_select.js: ' + o.read().decode().strip())
_, o, _ = ssh.exec_command('grep -c statusSel /opt/blossom/web/static/js/version.js')
print('statusSel count: ' + o.read().decode().strip())

ssh.close()
print('DONE' if status == 'active' else 'FAIL: ' + status)
