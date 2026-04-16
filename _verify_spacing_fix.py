"""Verify insight.css v=20260412_8 on server with line-height:1.2 and margin-bottom:0"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # CSS version in HTML
    "grep 'insight.css' /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html",
    # CSS content
    "sed -n '627,633p' /opt/blossom/web/static/css/insight.css",
    # Verify keywords
    "grep -c 'line-height' /opt/blossom/web/static/css/insight.css",
    "grep 'margin-bottom:0' /opt/blossom/web/static/css/insight.css | head -5",
]

for cmd in cmds:
    print(f">>> {cmd}")
    _, stdout, _ = c.exec_command(cmd)
    print(stdout.read().decode().rstrip())
    print()

c.close()
