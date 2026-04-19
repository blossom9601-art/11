"""Deploy SVG icon + CSS specificity fix"""
import paramiko, os

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
BASE = os.path.dirname(os.path.abspath(__file__))
REMOTE = '/opt/blossom/web'

FILES = [
    'static/css/insight.css',
    'static/image/svg/insight/free-icon-font-microchip-ai.svg',
    'static/js/5.insight/5-1.insight/insight_list_common.js',
    'app/routes/api.py',
]

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    for rel in FILES:
        local = os.path.join(BASE, rel)
        remote = f'{REMOTE}/{rel}'
        print(f'  Upload: {rel}')
        sftp.put(local, remote)

    sftp.close()

    print('\n  Restarting blossom-web...')
    _, out, err = ssh.exec_command('systemctl restart blossom-web')
    out.read()
    e = err.read().decode()
    if e:
        print(f'  STDERR: {e}')

    _, out, _ = ssh.exec_command('systemctl is-active blossom-web')
    print(f'  Service: {out.read().decode().strip()}')
    ssh.close()
    print('\n  Done.')

if __name__ == '__main__':
    main()
