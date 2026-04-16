import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Get the full blossom-lumina.conf - especially the static location blocks
_, o, _ = ssh.exec_command('cat /etc/nginx/conf.d/blossom-lumina.conf', timeout=10)
conf = o.read().decode('utf-8', 'replace')
print(conf)

ssh.close()
