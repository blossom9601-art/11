"""Find remote template paths on production server."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'find /opt/blossom -name layout.html 2>/dev/null',
    'find /opt/blossom -name header.html 2>/dev/null',
    'find /opt/blossom -name dynamic_tab_placeholder.html 2>/dev/null',
    'ls -la /opt/blossom/app/templates/ 2>/dev/null || echo "no layouts dir"',
]
for cmd in cmds:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f'CMD: {cmd}')
    if out:
        print(f'  OUT: {out}')
    if err:
        print(f'  ERR: {err}')
    print()

ssh.close()
