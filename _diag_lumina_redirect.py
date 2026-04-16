import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'grep -n "redirect\\|route" /opt/blossom/lumina/web/app/app_factory.py | head -30',
    'grep -rn "redirect" /opt/blossom/lumina/web/app/*.py | head -20',
]
for cmd in cmds:
    print(f"=== {cmd} ===")
    _, o, e = ssh.exec_command(cmd, timeout=10)
    print(o.read().decode())

ssh.close()
