# -*- coding: utf-8 -*-
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.107', username='root', password='123456')
_, stdout, stderr = ssh.exec_command('mysql -u root -e "SHOW DATABASES;"')
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print('ERR:', err)
ssh.close()
