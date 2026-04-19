import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

sftp = ssh.open_sftp()

sftp.put(
    'static/js/5.insight/5-1.insight/insight_list_common.js',
    '/opt/blossom/web/static/js/5.insight/5-1.insight/insight_list_common.js',
)
print('[1/5] JS deployed')

templates = [
    '5-1-1.trend/1.trend_list.html',
    '5-1-2.security/1.security_list.html',
    '5-1-3.report/1.report_list.html',
    '5-1-4.technical/1.technical_list.html',
]
for i, t in enumerate(templates, 2):
    local = f'app/templates/5.insight/5-1.insight/{t}'
    remote = f'/opt/blossom/web/app/templates/5.insight/5-1.insight/{t}'
    sftp.put(local, remote)
    print(f'[{i}/5] {t} deployed')

sftp.close()

# Restart service
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=15)
o.read()
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
print('service:', o.read().decode().strip())

ssh.close()
print('DONE')
