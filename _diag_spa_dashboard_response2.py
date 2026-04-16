import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

cmd = r'''
# 1) form login (browser-like)
curl -sk -c /tmp/wd_ck3.txt https://127.0.0.1/login -o /tmp/wd_login_page.html >/dev/null
curl -sk -b /tmp/wd_ck3.txt -c /tmp/wd_ck3.txt -X POST https://127.0.0.1/login \
  -d 'employee_id=admin&password=admin1234!' -D /tmp/wd_login_headers.txt -o /tmp/wd_after_login.html >/dev/null

# 2) full and spa fetch
curl -sk -b /tmp/wd_ck3.txt https://127.0.0.1/p/cat_business_dashboard -o /tmp/wd_full2.html
curl -sk -b /tmp/wd_ck3.txt -H "X-Requested-With: blossom-spa" https://127.0.0.1/p/cat_business_dashboard -o /tmp/wd_spa2.html

echo '=== LOGIN HEADER LOCATION ==='
grep -i '^Location:' /tmp/wd_login_headers.txt || true

echo '=== FULL TOP ==='
head -n 12 /tmp/wd_full2.html

echo '=== SPA TOP ==='
head -n 12 /tmp/wd_spa2.html

echo '=== MARKERS ==='
echo FULL_HAS_JS=$(grep -c "1.work_dashboard.js" /tmp/wd_full2.html)
echo SPA_HAS_JS=$(grep -c "1.work_dashboard.js" /tmp/wd_spa2.html)
echo FULL_HAS_STYLE_MARKER=$(grep -c "#work-dashboard-root .work-dash-grid" /tmp/wd_full2.html)
echo SPA_HAS_STYLE_MARKER=$(grep -c "#work-dashboard-root .work-dash-grid" /tmp/wd_spa2.html)
echo FULL_HAS_MAIN_ROOT=$(grep -c "id=\"work-dashboard-root\"" /tmp/wd_full2.html)
echo SPA_HAS_MAIN_ROOT=$(grep -c "id=\"work-dashboard-root\"" /tmp/wd_spa2.html)
'''

_, o, e = ssh.exec_command(cmd, timeout=45)
print(o.read().decode('utf-8', 'replace'))
err = e.read().decode('utf-8', 'replace').strip()
if err:
    print(err)

ssh.close()
