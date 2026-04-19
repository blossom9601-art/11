import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()
sftp.put('static/js/blossom.js', '/opt/blossom/web/static/js/blossom.js')
print('[1/1] blossom.js uploaded')
sftp.close()

# Clear nginx cache
ssh.exec_command('rm -rf /var/cache/nginx/blossom_proxy/* 2>/dev/null')

# Restart
_, o, _ = ssh.exec_command('systemctl restart blossom-web && systemctl reload nginx', timeout=30)
o.read()
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
status = o.read().decode().strip()
print(f'service: {status}')

# Verify fix
_, o, _ = ssh.exec_command("grep -n 'X-Requested-With.*blossom-spa' /opt/blossom/web/static/js/blossom.js | head -5")
print(f'Header occurrences:\n{o.read().decode().strip()}')

ssh.close()
print('DONE' if status == 'active' else f'WARNING: {status}')
