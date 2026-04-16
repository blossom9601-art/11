"""운영 서버 blossom.js 약관 관련 코드 확인"""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    ('약관 dropdown item', 'grep -n "terms" /opt/blossom/web/static/js/blossom.js | head -10'),
    ('profile/terms/logout', 'grep -n "프로필\\|약관\\|로그아웃" /opt/blossom/web/static/js/blossom.js | head -10'),
    ('auth.py terms route', 'grep -n "pending_terms\\|needs_terms\\|auth.terms" /opt/blossom/web/app/routes/auth.py | head -10'),
    ('auth.py login json redirect', 'sed -n "725,740p" /opt/blossom/web/app/routes/auth.py'),
]

for label, cmd in cmds:
    print(f'=== {label} ===')
    _, so, se = ssh.exec_command(cmd, timeout=10)
    print(so.read().decode('utf-8', 'replace').strip() or se.read().decode('utf-8', 'replace').strip())
    print()

ssh.close()
print('DONE')
