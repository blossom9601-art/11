import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'find / -name category2.css 2>/dev/null',
    'find / -name 1.work_classification_list.html 2>/dev/null',
    'cat /etc/systemd/system/blossom-web.service 2>/dev/null || echo NO_SERVICE',
    'nginx -T 2>/dev/null | grep -A8 "location.*static"',
    'grep -n form-row-wide /opt/blossom/web/static/css/category2.css 2>/dev/null || echo NOT_FOUND_IN_OPT',
    'grep -n form-row-wide /var/www/blossom/static/css/category2.css 2>/dev/null || echo NOT_FOUND_IN_VAR',
    'grep -n hidden.*hw_count /opt/blossom/web/app/templates/9.category/9-1.business/9-1-1.work_classification/1.work_classification_list.html 2>/dev/null || echo NOT_FOUND_HTML',
]
for cmd in cmds:
    print('=== ' + cmd[:70] + ' ===')
    _, o, e = ssh.exec_command(cmd, timeout=15)
    print(o.read().decode('utf-8', 'replace')[:600])
    print()

ssh.close()
print('DONE')
