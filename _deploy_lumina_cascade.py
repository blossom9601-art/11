#!/usr/bin/env python3
"""Deploy updated app_factory.py + cli_api.py to remote Lumina server."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)
sftp = ssh.open_sftp()

sftp.put('agents/web/app_factory.py', '/opt/blossom/lumina/web/app/__init__.py')
print('[1] app_factory.py uploaded')

sftp.put('agents/web/cli_api.py', '/opt/blossom/lumina/web/app/cli_api.py')
print('[2] cli_api.py uploaded')

sftp.close()

_, o, e = ssh.exec_command('systemctl restart lumina-web')
rc = o.channel.recv_exit_status()
_, o2, _ = ssh.exec_command('systemctl is-active lumina-web')
print('[3] Restart:', 'OK' if rc == 0 else 'FAIL')
print('    Service:', o2.read().decode().strip())

ssh.close()
print('DONE')
