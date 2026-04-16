"""운영 서버 현재 상태 진단"""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    ('auth.py terms count', 'grep -c terms /opt/blossom/web/app/routes/auth.py'),
    ('auth.py AJAX terms', 'grep -n "X-Requested-With" /opt/blossom/web/app/routes/auth.py'),
    ('blossom.js dropdown', 'grep -n "data-action" /opt/blossom/web/static/js/blossom.js | head -5'),
    ('spa_shell version', 'grep "blossom.js" /opt/blossom/web/app/templates/layouts/spa_shell.html'),
    ('ADMIN terms date', """python3 -c "import sqlite3; c=sqlite3.connect('/opt/blossom/web/instance/dev_blossom.db'); print(c.execute(\\"SELECT emp_no, last_terms_accepted_at FROM auth_users WHERE emp_no='ADMIN'\\").fetchone())" """),
]

for label, cmd in cmds:
    print(f'=== {label} ===')
    _, so, se = ssh.exec_command(cmd, timeout=10)
    out = so.read().decode('utf-8', 'replace').strip()
    err = se.read().decode('utf-8', 'replace').strip()
    print(out or err or '(empty)')
    print()

ssh.close()
print('DONE')
