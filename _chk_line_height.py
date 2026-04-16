"""Check system.css line 44 context for line-height: 1.6"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.56.108', username='root', password='123456')

cmds = [
    "sed -n '35,55p' /opt/blossom/web/static/css/system.css",
    # Also check blossom.css around line 272 for line-height 1.2
    "sed -n '265,280p' /opt/blossom/web/static/css/blossom.css",
    # And line 368
    "sed -n '360,375p' /opt/blossom/web/static/css/blossom.css",
]

for cmd in cmds:
    print(f">>> {cmd}")
    _, stdout, _ = c.exec_command(cmd)
    print(stdout.read().decode().rstrip())
    print()

c.close()
