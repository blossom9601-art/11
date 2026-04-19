import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Login and test SPA
_, o, e = ssh.exec_command('''
# Login first
curl -s -c /tmp/bcc -L \
  -d "username=admin&password=admin123!" \
  http://127.0.0.1:8000/login \
  -o /dev/null -w "login_code=%{http_code}"

echo ""

# SPA request - regular (used by __spaFetchPage)
curl -s -b /tmp/bcc \
  -H "X-Requested-With: blossom-spa" \
  http://127.0.0.1:8000/p/cat_server \
  -o /tmp/spa_resp.html -w "spa_code=%{http_code} size=%{size_download}"

echo ""

# Check if response has main-content
grep -c "main-content" /tmp/spa_resp.html 2>/dev/null
echo "---RESPONSE HEAD---"
head -30 /tmp/spa_resp.html 2>/dev/null
echo "---MAIN TAG---"
grep -o '<main[^>]*>' /tmp/spa_resp.html 2>/dev/null
echo "---SKELETON CHECK---"
grep -c "spa-skeleton" /tmp/spa_resp.html 2>/dev/null
echo "---DATA-SPA-BOOT---"
grep -c "data-spa-boot" /tmp/spa_resp.html 2>/dev/null
''')
print(o.read().decode())
err = e.read().decode().strip()
if err: print("STDERR:", err)

ssh.close()
print("DONE")
