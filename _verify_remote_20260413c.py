import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)
for cmd in [
    "grep -n 'info-message-v2.js?v=20260413c' /opt/blossom/web/app/templates/2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.html",
    "grep -n 'buildPopover(container, DEFAULT_INFO_ITEM);' /opt/blossom/web/static/js/common/info-message-v2.js",
]:
    _, so, se = ssh.exec_command(cmd, timeout=20)
    print((so.read().decode('utf-8','ignore') + se.read().decode('utf-8','ignore')).strip() or '(none)')
ssh.close()
