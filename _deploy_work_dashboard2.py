import paramiko, os
HOST='192.168.56.108'; USER='root'; PASS='123456'
REMOTE_BASE='/opt/blossom/web'
LOCAL_BASE=r'C:\Users\ME\Desktop\blossom'
FILES=[
  ('static/js/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.js',
   'static/js/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.js'),
  ('app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html',
   'app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html'),
]
ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST,username=USER,password=PASS)
sftp=ssh.open_sftp()
for lr,rr in FILES:
    lp=os.path.join(LOCAL_BASE,lr)
    rp=REMOTE_BASE+'/'+rr
    sftp.put(lp,rp)
    print('OK',rp)
i,o,e=ssh.exec_command('systemctl restart blossom-web')
print('restart:',o.read().decode().strip() or 'OK')
sftp.close()
ssh.close()
print('Done.')
