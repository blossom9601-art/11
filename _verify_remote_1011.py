import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

checks = [
    "grep -n 'info-message.js?v=1.0.11' /opt/blossom/web/app/templates/2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.html",
    "grep -n 'info-fallback-badge\|renderer: '\''svg'\''\|zIndex = '\''2'\''' /opt/blossom/web/static/js/common/info-message.js",
]
for c in checks:
    _, so, se = ssh.exec_command(c, timeout=20)
    print((so.read().decode('utf-8', 'ignore') + se.read().decode('utf-8', 'ignore')).strip() or '(none)')

ssh.close()
