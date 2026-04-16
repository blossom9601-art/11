import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

cmds = [
    r"grep -n 'dynamic-system-tabs\|tab-content\|cat_business_dashboard\|1.work_dashboard.js' /tmp/wd_full2.html | head -30",
    r"grep -n 'dynamic-system-tabs\|tab-content\|cat_business_dashboard\|1.work_dashboard.js' /tmp/wd_spa2.html | head -30",
    r"tail -n 30 /tmp/wd_full2.html",
    r"tail -n 30 /tmp/wd_spa2.html",
]

for cmd in cmds:
    print('\n===', cmd, '===')
    _, o, e = ssh.exec_command(cmd, timeout=15)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    print(out or err or '(empty)')

ssh.close()
