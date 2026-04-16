import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # Full nginx config
    'cat /etc/nginx/conf.d/blossom.conf 2>/dev/null || echo NO_BLOSSOM_CONF',
    'cat /etc/nginx/conf.d/lumina.conf 2>/dev/null || echo NO_LUMINA_CONF',
    'ls -la /etc/nginx/conf.d/',
    # Check if static files are served by nginx directly or proxied
    'find /opt/blossom/lumina/web -name category2.css 2>/dev/null || echo NO_CSS_IN_LUMINA',
    'grep -n form-row-wide /opt/blossom/lumina/web/static/css/category2.css 2>/dev/null || echo NO_MATCH_LUMINA',
    # Check HTML in lumina path
    'find /opt/blossom/lumina/web -name 1.work_classification_list.html 2>/dev/null || echo NO_HTML_IN_LUMINA',
]
for cmd in cmds:
    print('=== ' + cmd[:70] + ' ===')
    _, o, e = ssh.exec_command(cmd, timeout=15)
    print(o.read().decode('utf-8', 'replace')[:1500])
    print()

ssh.close()
print('DONE')
