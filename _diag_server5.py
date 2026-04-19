import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Get gunicorn config to find port
_, o, _ = ssh.exec_command('cat /opt/blossom/web/gunicorn_blossom.conf.py')
print("=== Gunicorn Config ===")
print(o.read().decode().strip())

# Check running processes
_, o, _ = ssh.exec_command('ps aux | grep gunicorn | grep -v grep')
print("\n=== Gunicorn Processes ===")
print(o.read().decode().strip())

# Check nginx upstream config
_, o, _ = ssh.exec_command('grep -r "upstream\\|proxy_pass\\|8000\\|5000\\|8080" /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null | head -20')
print("\n=== Nginx upstream ===")
print(o.read().decode().strip())

# Login with proper cookie jar, then test SPA fetch with blossom-spa header
_, o, _ = ssh.exec_command('''
cd /opt/blossom/web
/opt/blossom/web/venv/bin/python -c "
from app import create_app
app = create_app()
with app.test_client() as c:
    # Login
    r = c.post('/login', data={'username':'admin','password':'admin123!'}, follow_redirects=True)
    print('login status:', r.status_code)
    
    # Normal page request (should get spa_shell)
    r = c.get('/p/hw_server_list')
    print('normal /p/hw_server_list:', r.status_code, 'len:', len(r.data))
    has_skeleton = b'spa-skeleton' in r.data
    has_spa_boot = b'data-spa-boot' in r.data
    print('  has skeleton:', has_skeleton, 'has spa-boot:', has_spa_boot)
    
    # SPA fetch (should get actual content)
    r = c.get('/p/hw_server_list', headers={'X-Requested-With': 'blossom-spa'})
    print('SPA /p/hw_server_list:', r.status_code, 'len:', len(r.data))
    has_main = b'main-content' in r.data
    has_skeleton2 = b'spa-skeleton' in r.data
    print('  has main:', has_main, 'has skeleton:', has_skeleton2)
    print('  first 300 chars:', r.data[:300].decode('utf-8', errors='replace'))
" 2>&1
''')
print("\n=== Flask test_client ===")
print(o.read().decode())

ssh.close()
print("DONE")
