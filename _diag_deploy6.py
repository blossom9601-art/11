import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Verify deployed HTML has cache-buster
_, o, _ = ssh.exec_command('grep category2.css /opt/blossom/web/app/templates/9.category/9-1.business/9-1-1.work_classification/1.work_classification_list.html')
print('HTML category2.css line:', o.read().decode().strip())

# 2. Also check other business tab HTMLs that use category2.css (they might also need version bump)
_, o, _ = ssh.exec_command('grep -rn "category2.css" /opt/blossom/web/app/templates/9.category/ 2>/dev/null | head -20')
print('\nAll category2.css refs:')
print(o.read().decode().strip())

# 3. Check bls-modal.css reference (it's loaded from _header.html, comes with its own version)
_, o, _ = ssh.exec_command('grep "bls-modal" /opt/blossom/web/app/templates/layouts/_header.html 2>/dev/null')
print('\nbls-modal ref:', o.read().decode().strip())

# 4. Restart blossom-web service
_, o, e = ssh.exec_command('systemctl restart blossom-web', timeout=15)
o.read(); e.read()
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
print('\nService status:', o.read().decode().strip())

# 5. Verify the served CSS via curl (bypassing browser cache)
_, o, _ = ssh.exec_command('curl -sk https://127.0.0.1/static/css/category2.css?v=20260412 2>/dev/null | grep -n form-row-wide')
print('\nServed CSS form-row-wide:')
print(o.read().decode().strip())

ssh.close()
print('\nDONE')
