import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Check route patterns
_, o, _ = ssh.exec_command('''
cd /opt/blossom/web
/opt/blossom/web/venv/bin/python -c "
from app import create_app
app = create_app()
with app.app_context():
    rules = [r.rule for r in app.url_map.iter_rules() if '/p/' in r.rule]
    for r in sorted(rules)[:20]:
        print(r)
" 2>/dev/null
''')
print("Page routes:")
print(o.read().decode())

# Try some common pages
_, o, _ = ssh.exec_command('''
curl -s -c /tmp/bcc -L -d "username=admin&password=admin123!" http://127.0.0.1:8000/login -o /dev/null
for path in /p/dashboard /p/server /p/hardware /dashboard /p/cat_hw_server /p/settings; do
  code=$(curl -s -b /tmp/bcc -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000$path" 2>/dev/null)
  echo "$path -> $code"
done
''')
print("Route tests:")
print(o.read().decode())

ssh.close()
print("DONE")
