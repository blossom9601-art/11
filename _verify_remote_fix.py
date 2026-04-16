"""Verify remote deployment of SPA tab fix."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

checks = [
    ('Fix in blossom.js file', 'grep -c oldAttrs /opt/blossom/web/static/js/blossom.js'),
    ('JS version in layout', "grep 'blossom.js' /opt/blossom/web/app/templates/layouts/layout.html"),
    ('Service status', 'systemctl is-active blossom-web'),
    ('Served JS has fix', "curl -sk https://localhost/static/js/blossom.js 2>/dev/null | grep -c oldAttrs"),
    ('Served JS version tag', "curl -sI 'https://localhost/static/js/blossom.js?v=20260412_spa_tab' 2>/dev/null | head -5"),
    ('Nginx cache headers', "curl -sI 'https://localhost/static/js/blossom.js' 2>/dev/null | grep -i 'cache\\|etag\\|last-mod\\|expires'"),
]

for label, cmd in checks:
    _, so, se = ssh.exec_command(cmd, timeout=10)
    out = so.read().decode().strip()
    err = se.read().decode().strip()
    print(f'{label}: {out}')
    if err:
        print(f'  ERR: {err}')

ssh.close()
