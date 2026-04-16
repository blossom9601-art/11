import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

CHECKS = [
    (
        'template count v1.0.9',
        "grep -R -n '/static/js/common/info-message.js?v=1.0.9' /opt/blossom/web/app/templates | wc -l",
    ),
    (
        'onprem uses v1.0.9',
        "grep -n 'info-message.js?v=1.0.9' /opt/blossom/web/app/templates/2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.html",
    ),
    (
        'use_lottie true',
        "grep -n 'USE_LOTTIE_STICKER = true' /opt/blossom/web/static/js/common/info-message.js",
    ),
    (
        'renderer canvas',
        "grep -n \"renderer: 'canvas'\" /opt/blossom/web/static/js/common/info-message.js",
    ),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

for name, cmd in CHECKS:
    _, so, se = ssh.exec_command(cmd, timeout=20)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    print(f'[{name}]')
    print(out or err or '(no output)')

ssh.close()
