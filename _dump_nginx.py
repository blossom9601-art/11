import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
_, o, _ = ssh.exec_command('cat /etc/nginx/conf.d/blossom-lumina.conf', timeout=10)
content = o.read().decode()
with open('_nginx_conf_dump.txt', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Saved {len(content)} bytes')
ssh.close()
