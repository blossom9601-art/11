"""Fix gunicorn timeout to 200 and verify"""
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check current
_, o, _ = ssh.exec_command('grep timeout /opt/blossom/web/gunicorn_blossom.conf.py')
print('Before:', o.read().decode().strip())

# Fix
_, o, _ = ssh.exec_command(
    'sed -i "s/timeout = 120/timeout = 200/" /opt/blossom/web/gunicorn_blossom.conf.py'
)
o.read()

# Verify
_, o, _ = ssh.exec_command('grep timeout /opt/blossom/web/gunicorn_blossom.conf.py')
print('After:', o.read().decode().strip())

# Restart service
_, o, _ = ssh.exec_command('systemctl restart blossom-web')
o.read()

import time; time.sleep(3)
_, o, _ = ssh.exec_command('systemctl is-active blossom-web')
print('Service:', o.read().decode().strip())

ssh.close()
print('[DONE]')
