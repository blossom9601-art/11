import os
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
ROOT = r'C:\Users\ME\Desktop\blossom'
REMOTE = '/opt/blossom/web'

files = [
    (
        os.path.join(ROOT, 'app', 'templates', '9.category', '9-1.business', '9-1-0.work_dashboard', '1.work_dashboard.html'),
        f"{REMOTE}/app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html",
    ),
    (
        os.path.join(ROOT, 'static', 'js', '9.category', '9-1.business', '9-1-0.work_dashboard', '1.work_dashboard.js'),
        f"{REMOTE}/static/js/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.js",
    ),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=10)
sftp = ssh.open_sftp()

for lp, rp in files:
    sftp.put(lp, rp)
    print('DEPLOYED:', rp)

sftp.close()

# restart
_, o, _ = ssh.exec_command('systemctl restart blossom-web')
o.channel.recv_exit_status()

# verify markers
checks = [
    "grep -n '1.work_dashboard.js?v=1.3.8' /opt/blossom/web/app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html",
    "grep -n '_pinGridLayout' /opt/blossom/web/static/js/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.js",
    "systemctl is-active blossom-web",
]
for cmd in checks:
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    print('CHECK:', cmd)
    print(out or err or '(empty)')

ssh.close()
print('DONE')
