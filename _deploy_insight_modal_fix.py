#!/usr/bin/env python3
"""Deploy insight modal attachment upload fix to production."""
import paramiko, os

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
BASE = os.path.dirname(os.path.abspath(__file__))
REMOTE_BASE = '/opt/blossom/web'
SVC  = 'blossom-web'

FILES = [
    ('static/js/5.insight/5-1.insight/insight_list_common.js',
     'static/js/5.insight/5-1.insight/insight_list_common.js'),
]

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    for local_rel, remote_rel in FILES:
        local_path = os.path.join(BASE, local_rel)
        remote_path = f'{REMOTE_BASE}/{remote_rel}'
        print(f'  Upload: {local_rel}')
        sftp.put(local_path, remote_path)

    sftp.close()

    print(f'\n  Restarting {SVC}...')
    stdin, stdout, stderr = ssh.exec_command(f'sudo systemctl restart {SVC}')
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print(f'  STDERR: {err}')

    stdin, stdout, stderr = ssh.exec_command(f'sudo systemctl is-active {SVC}')
    status = stdout.read().decode().strip()
    print(f'  Service status: {status}')

    ssh.close()
    print('\n  Done.')

if __name__ == '__main__':
    main()
