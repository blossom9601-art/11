import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

CHECKS = [
    ('service', 'systemctl is-active blossom-web'),
    ('listen 8080', "ss -lntp | grep ':8080' || true"),
    ('listen 80', "ss -lntp | grep ':80' || true"),
    (
        'login page',
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/login",
    ),
    (
        'login page :80',
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/login",
    ),
    (
        'login page :80 -L',
        "curl -s -L -o /dev/null -w '%{http_code}' http://127.0.0.1/login",
    ),
    (
        'lottie js',
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/static/js/vendor/lottie.min.js",
    ),
    (
        'info api',
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/info-messages/project.workflow_builder",
    ),
    (
        'info api :80',
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/info-messages/project.workflow_builder",
    ),
    (
        'lottie js :80 -L',
        "curl -s -L -o /dev/null -w '%{http_code}' http://127.0.0.1/static/js/vendor/lottie.min.js",
    ),
    (
        'info api :80 -L',
        "curl -s -L -o /dev/null -w '%{http_code}' http://127.0.0.1/api/info-messages/project.workflow_builder",
    ),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

for name, cmd in CHECKS:
    _, so, se = ssh.exec_command(cmd, timeout=15)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    print(f"{name}: {out or '(no output)'}")
    if err:
        print(f"{name} err: {err}")

ssh.close()
