import paramiko

HOST='192.168.56.108'
USER='root'
PASSWORD='123456'

checks=[
 ('count_1010', "grep -R -n '/static/js/common/info-message.js?v=1.0.10' /opt/blossom/web/app/templates | wc -l"),
 ('onprem_1010', "grep -n 'info-message.js?v=1.0.10' /opt/blossom/web/app/templates/2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.html"),
 ('no_old_svg', "grep -n 'free-icon-information.svg' /opt/blossom/web/static/js/common/info-message.js"),
 ('json_path', "grep -n 'free-animated-icon-information.json' /opt/blossom/web/static/js/common/info-message.js"),
]

ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)
for n,c in checks:
    _,so,se=ssh.exec_command(c, timeout=20)
    out=(so.read().decode('utf-8','ignore')+se.read().decode('utf-8','ignore')).strip()
    print(f'{n}: {out or "(none)"}')
ssh.close()
