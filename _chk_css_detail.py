"""Check CSS details for blog-add-section-title on server"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.56.108', username='root', password='123456')

cmds = [
    "grep -rn 'blog-add-section-title' /opt/blossom/web/static/css/ 2>/dev/null",
    "grep -rn 'blog-add-section-title' /opt/blossom/web/static/js/ 2>/dev/null | head -20",
    "sed -n '620,670p' /opt/blossom/web/static/css/insight.css",
    "grep -oP 'href=\"[^\"]*\\.css[^\"]*\"' /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html 2>/dev/null",
    # Check ALL CSS links in the page (including base template)
    "grep -rn 'insight.*css\\|blossom.*css\\|common.*css\\|base.*css\\|style.*css' /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html 2>/dev/null",
    # Check the base template
    "head -1 /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html",
    # Find the base template
    "grep -rn 'extends' /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html 2>/dev/null",
]

for cmd in cmds:
    print(f">>> {cmd}")
    _, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip():
        print(out.strip())
    if err.strip():
        print(f"ERR: {err.strip()}")
    print()

c.close()
