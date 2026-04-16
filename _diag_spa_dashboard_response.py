import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

cmd = r'''
curl -sk -c /tmp/wd_ck2.txt -X POST https://127.0.0.1/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"employee_id":"admin","password":"admin1234!"}' >/dev/null

curl -sk -b /tmp/wd_ck2.txt https://127.0.0.1/p/cat_business_dashboard -o /tmp/wd_full.html
curl -sk -b /tmp/wd_ck2.txt -H "X-Requested-With: blossom-spa" https://127.0.0.1/p/cat_business_dashboard -o /tmp/wd_spa.html

echo FULL_HAS_JS=$(grep -c "1.work_dashboard.js" /tmp/wd_full.html)
echo SPA_HAS_JS=$(grep -c "1.work_dashboard.js" /tmp/wd_spa.html)
echo FULL_HAS_STYLE_MARKER=$(grep -c "#work-dashboard-root .work-dash-grid" /tmp/wd_full.html)
echo SPA_HAS_STYLE_MARKER=$(grep -c "#work-dashboard-root .work-dash-grid" /tmp/wd_spa.html)
echo FULL_HEAD=$(grep -c "<head" /tmp/wd_full.html)
echo SPA_HEAD=$(grep -c "<head" /tmp/wd_spa.html)
echo FULL_MAIN=$(grep -c "work-dashboard-root" /tmp/wd_full.html)
echo SPA_MAIN=$(grep -c "work-dashboard-root" /tmp/wd_spa.html)
'''

_, o, e = ssh.exec_command(cmd, timeout=40)
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print(err)

ssh.close()
