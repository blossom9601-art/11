#!/usr/bin/env python3
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

# Start nginx
_, so, se = ssh.exec_command('systemctl start nginx', timeout=10)
so.read(); se.read()
time.sleep(2)

_, so, _ = ssh.exec_command('systemctl is-active nginx', timeout=5)
print('nginx:', so.read().decode().strip())

_, so, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
print('blossom-web:', so.read().decode().strip())

cmd = "curl -sk -o /dev/null -w '%{http_code}' https://localhost/login"
_, so, _ = ssh.exec_command(cmd, timeout=10)
print('curl login:', so.read().decode().strip())

ssh.close()
