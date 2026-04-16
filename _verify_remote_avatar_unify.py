import paramiko

host='192.168.56.108'
user='root'
pw='123456'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)

checks = [
    "grep -n 'function resolveSelfAvatar\\|isSelfConversation(conv))' /opt/blossom/web/static/js/addon_application/3.chat.js",
    "grep -n 'UserProfile.query.filter(UserProfile.emp_no.ilike(current_emp_no))' /opt/blossom/web/app/__init__.py",
]
for c in checks:
    _, so, se = ssh.exec_command(c, timeout=20)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    print('---', c)
    print(out or '(no stdout)')
    print(err or '(no stderr)')

ssh.close()
