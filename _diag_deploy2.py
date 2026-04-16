import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # What service is actually running the app?
    'systemctl list-units --type=service --state=running | grep -i blossom',
    'ps aux | grep -i gunicorn | grep -v grep',
    'ps aux | grep -i flask | grep -v grep',
    'ps aux | grep -i python | grep -v grep | head -10',
    # Nginx config for static files
    'nginx -T 2>&1 | head -100',
    # Check what port gunicorn is bound to
    'ss -tlnp | grep -E "8080|9601|443|80"',
]
for cmd in cmds:
    print('=== ' + cmd[:70] + ' ===')
    _, o, e = ssh.exec_command(cmd, timeout=15)
    out = o.read().decode('utf-8', 'replace')[:800]
    err = e.read().decode('utf-8', 'replace')[:200]
    print(out)
    if err.strip():
        print('STDERR:', err)
    print()

ssh.close()
print('DONE')
