"""Check global CSS rules that could affect blog-add-section-title"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # Check blossom.css for global line-height, body styles
    "grep -n 'line-height' /opt/blossom/web/static/css/blossom.css | head -30",
    # Check system.css similarly
    "grep -n 'line-height' /opt/blossom/web/static/css/system.css | head -30",
    # Check blossom.css for body/html/div rules
    "grep -n '^body\\|^html\\|^\\.modal\\|^\\.server-add' /opt/blossom/web/static/css/blossom.css | head -20",
    # Check blossom.css for modal related rules
    "grep -n 'modal.*line-height\\|modal-open\\|server-add-modal' /opt/blossom/web/static/css/blossom.css | head -20",
    # Check system.css for global settings
    "sed -n '1,30p' /opt/blossom/web/static/css/system.css",
    # Check blossom.css for body settings
    "sed -n '1,30p' /opt/blossom/web/static/css/blossom.css",
]

for cmd in cmds:
    print(f">>> {cmd}")
    _, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode()
    if out.strip():
        print(out.strip())
    print()

c.close()
