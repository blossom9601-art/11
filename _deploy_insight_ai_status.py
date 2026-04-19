"""Deploy insight AI status icon + placeholder fix + RAG status"""
import paramiko, os

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
BASE = os.path.dirname(os.path.abspath(__file__))
REMOTE = '/opt/blossom/web'
SVC = 'blossom-web'

FILES = [
    'static/js/5.insight/5-1.insight/insight_list_common.js',
    'static/css/insight.css',
    'app/templates/5.insight/_shared/_content_editor_modal.html',
    'app/routes/api.py',
    'app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html',
    'app/templates/5.insight/5-1.insight/5-1-2.security/1.security_list.html',
    'app/templates/5.insight/5-1.insight/5-1-3.report/1.report_list.html',
    'app/templates/5.insight/5-1.insight/5-1-4.technical/1.technical_list.html',
    'app/templates/5.insight/5-2.blog/5-2-1.it_blog/1.blog_list.html',
    'app/templates/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html',
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
