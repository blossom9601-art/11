import paramiko

host='192.168.56.108'
user='root'
pw='123456'

ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)

cmd = "grep -n 'download_url\\|URL.createObjectURL\\|setAttribute(\"download\"' /opt/blossom/web/static/js/addon_application/3.chat.js"
_, so, se = ssh.exec_command(cmd, timeout=20)
out = so.read().decode('utf-8','ignore').strip()
err = se.read().decode('utf-8','ignore').strip()
print(out or '(no stdout)')
print(err or '(no stderr)')
ssh.close()
