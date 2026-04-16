"""Deploy SPA tab init fix (opex_contracts.js + capex_contract_list.js + blossom.js + templates)."""
import paramiko, os

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'
LOCAL_BASE = r'c:\Users\ME\Desktop\blossom'

files = [
    'static/js/blossom.js',
    'static/js/7.cost/7-1.opex/opex_contracts.js',
    'static/js/7.cost/7-2.capex/capex_contract_list.js',
    'app/templates/layouts/layout.html',
    'app/templates/layouts/header.html',
    'app/templates/common/dynamic_tab_placeholder.html',
    'app/templates/7.cost/7-1.opex/7-1-1.hardware/1.hardware_list.html',
    'app/templates/7.cost/7-1.opex/7-1-2.software/1.software_list.html',
    'app/templates/7.cost/7-1.opex/7-1-3.etc/1.etc_list.html',
    'app/templates/7.cost/7-2.capex/7-2-1.contract/1.contract_list.html',
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()

for rel in files:
    local_path = os.path.join(LOCAL_BASE, rel)
    remote_path = f'{REMOTE_BASE}/{rel}'
    print(f'  {rel}')
    sftp.put(local_path, remote_path)

sftp.close()

_, so, se = ssh.exec_command('systemctl restart blossom-web', timeout=15)
print('restart stderr:', se.read().decode().strip())

_, so, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
print('Service:', so.read().decode().strip())
ssh.close()
print('Deploy complete.')
