import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check server spa_shell.html
_, o, _ = ssh.exec_command('cat /opt/blossom/web/app/templates/layouts/spa_shell.html')
content = o.read().decode()
print("=== spa_shell.html ===")
print(content)

# Check blossom.js version in spa_shell
import re
m = re.search(r'blossom\.js\?v=(\S+)"', content)
print(f"\nblossom.js version on server: {m.group(1) if m else 'NOT FOUND'}")

# Check if header has fullscreen button
_, o, _ = ssh.exec_command('grep -n "btn-fullscreen" /opt/blossom/web/app/templates/layouts/_header.html')
print(f"\n_header.html fullscreen button:\n{o.read().decode()}")

# Quick SPA test - does /p/cat_server respond with main-content?
_, o, _ = ssh.exec_command('''curl -s -H "X-Requested-With: blossom-spa" -H "Cookie: session=test" http://127.0.0.1:5000/p/cat_server 2>&1 | head -50''')
print(f"\nSPA fetch test (first 50 lines):\n{o.read().decode()}")

ssh.close()
print("DONE")
