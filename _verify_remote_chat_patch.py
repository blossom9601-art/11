import paramiko

host='192.168.56.108'
user='root'
pw='123456'

ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)

cmds=[
    "grep -n 'IT인프라운영1팀\\|Dominic\\|support@blossom' /opt/blossom/web/app/templates/addon_application/3.chat.html",
    "grep -n 'filter(UserProfile.emp_no.ilike(emp_no))' /opt/blossom/web/app/routes/main.py",
    "grep -n 'filter(UserProfile.emp_no.ilike(emp_no))' /opt/blossom/web/app/routes/api.py",
]
for c in cmds:
    _,so,se=ssh.exec_command(c, timeout=20)
    out=so.read().decode('utf-8','ignore').strip()
    err=se.read().decode('utf-8','ignore').strip()
    print('---', c)
    print(out or '(no stdout)')
    print(err or '(no stderr)')
ssh.close()
