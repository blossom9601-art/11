import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

CHECKS = [
    (
        'onprem template version',
        "grep -n 'info-message.js?v=1.0.8' /opt/blossom/web/app/templates/2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.html",
    ),
    (
        'common js fallback marker',
        "grep -n 'Always render a visible baseline icon first\|renderFallbackIcon();' /opt/blossom/web/static/js/common/info-message.js",
    ),
    (
        'common js domloaded marker',
        "grep -n 'DOMLoaded\|data_failed\|removeFallbackIcon' /opt/blossom/web/static/js/common/info-message.js",
    ),
    (
        'fallback svg exists',
        "test -f /opt/blossom/web/static/image/svg/free-icon-information.svg; echo $?",
    ),
    (
        'lottie json exists',
        "test -f /opt/blossom/web/static/image/svg/free-animated-icon-information.json; echo $?",
    ),
    (
        'lottie runtime exists',
        "test -f /opt/blossom/web/static/js/vendor/lottie.min.js; echo $?",
    ),
    (
        'version count 1.0.7',
        "grep -R -n '/static/js/common/info-message.js?v=1.0.8' /opt/blossom/web/app/templates | wc -l",
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
