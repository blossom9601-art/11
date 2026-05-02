#!/usr/bin/env python3
"""Deploy HW/SW category dashboard empty-state sticker + pages.py full-render keys."""
import os
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
BASE = os.path.dirname(os.path.abspath(__file__))
REMOTE = '/opt/blossom/web'
SVC = 'lumina-web'

FILES = [
    'app/templates/9.category/9-2.hardware/0.hw_dashboard.html',
    'app/templates/9.category/9-3.software/0.sw_dashboard.html',
    'static/css/category-dashboard.css',
    'static/js/9.category/9-2.hardware/0.hw_category_dashboard.js',
    'static/js/9.category/9-3.software/0.sw_category_dashboard.js',
    'app/routes/pages.py',
]


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=25)
    sftp = ssh.open_sftp()

    for rel in FILES:
        local = os.path.join(BASE, rel)
        remote = f'{REMOTE}/{rel}'.replace('\\', '/')
        remote_dir = os.path.dirname(remote)
        ssh.exec_command(f'mkdir -p {remote_dir}')
        print(f'  Upload: {rel}')
        sftp.put(local, remote)

    sftp.close()

    print(f'\n  Restarting {SVC}...')
    _, out, err = ssh.exec_command(f'systemctl restart {SVC}')
    out.read()
    e = err.read().decode()
    if e:
        print(f'  STDERR: {e}')

    _, out, _ = ssh.exec_command(f'systemctl is-active {SVC}')
    print(f'  Service: {out.read().decode().strip()}')
    ssh.close()
    print('\n  Done.')


if __name__ == '__main__':
    main()
