import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Read full nginx config
_, o, _ = ssh.exec_command('cat /etc/nginx/conf.d/blossom-lumina.conf')
data = o.read().decode()

# Print proxy-related lines
for i, line in enumerate(data.splitlines(), 1):
    low = line.lower().strip()
    if any(k in low for k in ['proxy_pass', 'proxy_set_header host', 'proxy_redirect', 'location ', 'upstream']):
        print(f"{i}: {line}")

print("\n=== FULL CONFIG ===")
print(data)
ssh.close()
