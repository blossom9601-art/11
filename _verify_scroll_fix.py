import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

_, so, _ = ssh.exec_command('grep -c _preFocusST /opt/blossom/web/static/js/5.insight/5-1.insight/insight_list_common.js')
print('_preFocusST count:', so.read().decode().strip())

_, so, _ = ssh.exec_command('grep -c overflowY /opt/blossom/web/static/js/5.insight/5-1.insight/insight_list_common.js')
print('overflowY count:', so.read().decode().strip())

_, so, _ = ssh.exec_command('grep -roh "insight_list_common.js?v=[^\"]*" /opt/blossom/web/app/templates/5.insight/ | sort -u')
print('JS versions:', so.read().decode().strip())

ssh.close()
