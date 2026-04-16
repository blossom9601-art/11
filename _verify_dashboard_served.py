import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

cmd = (
    "curl -sk -c /tmp/wd_ck.txt -X POST https://127.0.0.1/api/auth/login "
    "-H 'Content-Type: application/json' "
    "-d '{\"employee_id\":\"admin\",\"password\":\"admin1234!\"}' >/dev/null; "
    "curl -sk -b /tmp/wd_ck.txt https://127.0.0.1/p/cat_business_dashboard "
    "| sed -n '1,220p'"
)
_, o, e = ssh.exec_command(cmd, timeout=30)
html = o.read().decode('utf-8', 'replace')
err = e.read().decode('utf-8', 'replace').strip()
if err:
    print('STDERR:', err)

needle = '1.work_dashboard.js?v='
pos = html.find(needle)
if pos >= 0:
    snippet = html[pos:pos + 60]
    print('FOUND:', snippet)
else:
    print('NOT_FOUND')

ssh.close()
