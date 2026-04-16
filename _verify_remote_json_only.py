import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

checks = [
    "grep -n 'info-message-v2.js?v=20260413b' /opt/blossom/web/app/templates/2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.html",
    "grep -n 'info-fallback-badge' /opt/blossom/web/static/js/common/info-message-v2.js",
    "grep -n 'free-animated-icon-information.json' /opt/blossom/web/static/js/common/info-message-v2.js",
]
for c in checks:
    _, so, se = ssh.exec_command(c, timeout=20)
    print((so.read().decode('utf-8', 'ignore') + se.read().decode('utf-8', 'ignore')).strip() or '(none)')

ssh.close()
