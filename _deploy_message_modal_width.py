import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

FILES = [
    (
        'static/css/category2.css',
        '/opt/blossom/web/static/css/category2.css'
    ),
    (
        'app/templates/9.category/9-1.business/9-1-1.work_classification/1.work_classification_list.html',
        '/opt/blossom/web/app/templates/9.category/9-1.business/9-1-1.work_classification/1.work_classification_list.html'
    ),
    (
        'app/templates/9.category/9-1.business/9-1-2.work_division/1.work_division_list.html',
        '/opt/blossom/web/app/templates/9.category/9-1.business/9-1-2.work_division/1.work_division_list.html'
    ),
    (
        'app/templates/9.category/9-1.business/9-1-3.work_status/1.work_status_list.html',
        '/opt/blossom/web/app/templates/9.category/9-1.business/9-1-3.work_status/1.work_status_list.html'
    ),
    (
        'app/templates/9.category/9-1.business/9-1-4.work_operation/1.work_operation_list.html',
        '/opt/blossom/web/app/templates/9.category/9-1.business/9-1-4.work_operation/1.work_operation_list.html'
    ),
    (
        'app/templates/9.category/9-1.business/9-1-5.work_group/1.work_group_list.html',
        '/opt/blossom/web/app/templates/9.category/9-1.business/9-1-5.work_group/1.work_group_list.html'
    ),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

sftp = ssh.open_sftp()
for local_path, remote_path in FILES:
    sftp.put(local_path, remote_path)
    print(f'Uploaded: {local_path}')
sftp.close()

ssh.exec_command('systemctl restart blossom-web')
_, stdout, _ = ssh.exec_command('sleep 2; systemctl is-active blossom-web')
print('Service:', stdout.read().decode().strip())

_, stdout, _ = ssh.exec_command("grep -n 'category2.css?v=20260414' /opt/blossom/web/app/templates/9.category/9-1.business/9-1-2.work_division/1.work_division_list.html")
print('Version marker:')
print(stdout.read().decode().strip())

_, stdout, _ = ssh.exec_command("grep -n 'system-message-modal .server-add-content' /opt/blossom/web/static/css/category2.css")
print('Message modal width rule marker:')
print(stdout.read().decode().strip())

ssh.close()
print('DONE')
