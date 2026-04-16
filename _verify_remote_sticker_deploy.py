import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

CHECKS = [
    (
        'manage template version',
        "grep -n 'info-message.js?v=1.0.7' /opt/blossom/web/app/templates/8.project/8-4.designer/8-4-2.manage/1.wf_designer_manage.html",
    ),
    (
        'explore template version',
        "grep -n 'info-message.js?v=1.0.7' /opt/blossom/web/app/templates/8.project/8-4.designer/8-4-1.explore/1.wf_designer_explore.html",
    ),
    (
        'info-message local loader',
        "grep -n 'INFO_LOTTIE_LOCAL\\|vendor/lottie.min.js' /opt/blossom/web/static/js/common/info-message.js",
    ),
    (
        'lottie runtime file',
        "test -f /opt/blossom/web/static/js/vendor/lottie.min.js; echo $?",
    ),
    (
        'lottie json file',
        "test -f /opt/blossom/web/static/image/svg/free-animated-icon-information.json; echo $?",
    ),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

for name, cmd in CHECKS:
    _, so, se = ssh.exec_command(cmd, timeout=15)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    print(f'[{name}]')
    print(out or err or '(no output)')

ssh.close()
