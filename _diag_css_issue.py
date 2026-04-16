import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Check what version HTML is using
_, o, _ = ssh.exec_command('grep category2.css /opt/blossom/web/app/templates/9.category/9-1.business/9-1-1.work_classification/1.work_classification_list.html')
print('HTML category2.css ref:')
print(o.read().decode().strip())

# 2. Check the actual CSS on server
_, o, _ = ssh.exec_command('grep -A3 "form-row.form-row-wide" /opt/blossom/web/static/css/category2.css')
print('\n\nCSS form-row-wide rules:')
print(o.read().decode().strip())

# 3. Check bls-modal CSS (where base .form-row is defined)
_, o, _ = ssh.exec_command('grep -n "^\.form-row" /opt/blossom/web/static/css/bls-modal.css 2>/dev/null | head -5 || echo NOT_IN_BLS_MODAL')
print('\n\nbls-modal .form-row (base) rules:')
print(o.read().decode().strip())

# 4. Actually test what CSS is served
_, o, _ = ssh.exec_command('curl -sk https://127.0.0.1/static/css/category2.css?v=20260412 2>/dev/null | grep -A3 "form-row.form-row-wide"')
print('\n\nServed CSS (category2):')
print(o.read().decode().strip())

ssh.close()
