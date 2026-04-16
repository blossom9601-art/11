import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'

local_html = r'C:\Users\ME\Desktop\blossom\app\templates\9.category\9-1.business\9-1-0.work_dashboard\1.work_dashboard.html'
remote_html = '/opt/blossom/web/app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=10)
sftp = ssh.open_sftp()
sftp.put(local_html, remote_html)
sftp.close()

_, o, _ = ssh.exec_command('systemctl restart blossom-web')
o.channel.recv_exit_status()

_, o, _ = ssh.exec_command("grep -n '#work-dashboard-root .work-dash-grid' /opt/blossom/web/app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html")
print(o.read().decode().strip())

_, o, _ = ssh.exec_command('systemctl is-active blossom-web')
print('service:', o.read().decode().strip())

ssh.close()
