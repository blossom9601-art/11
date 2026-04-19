"""Deploy api.py + pages.py to production + full verify."""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Upload files
sftp = ssh.open_sftp()
sftp.put(r'c:\Users\ME\Desktop\blossom\app\routes\api.py',
         '/opt/blossom/web/app/routes/api.py')
print('[OK] api.py')
sftp.put(r'c:\Users\ME\Desktop\blossom\app\routes\pages.py',
         '/opt/blossom/web/app/routes/pages.py')
print('[OK] pages.py')
sftp.close()

# Restart
i, o, e = ssh.exec_command('systemctl restart blossom-web')
o.read(); e.read()
print('[OK] restarted')
time.sleep(3)

# Verify
verify = r'''
import sys, os
sys.path.insert(0, "/opt/blossom/web")
os.chdir("/opt/blossom/web")
os.environ["FLASK_APP"] = "run.py"
from datetime import datetime
from app import create_app
app = create_app()
with app.test_client() as c:
    with c.session_transaction() as sess:
        sess["user_id"] = 1
        sess["emp_no"] = "ADMIN"
        sess["role"] = "ADMIN"
        sess["_login_at"] = datetime.utcnow().isoformat()
        sess["_last_active"] = datetime.utcnow().isoformat()

    queries = ["AI", "VPN", "서버", "보안", "블로그", "트렌드", "네트워크", "프로젝트", "작업", "워크플로우", "티켓", "DNS", "회사", "대시보드", "백업", "스토리지", "RACK", "취약점"]
    for q in queries:
        r = c.post("/api/search/unified",
                   json={"q": q, "limit": 20},
                   headers={"X-Requested-With": "XMLHttpRequest"},
                   content_type="application/json")
        d = r.get_json()
        if not d:
            print("  %s: NO_JSON status=%d" % (q, r.status_code))
            continue
        total = d.get("total", 0)
        has_rag = bool(d.get("rag_answer"))
        rows = d.get("rows", [])
        titles = list(set(row.get("title", "?")[:40] for row in rows))
        print("  %s: total=%d rag=%s titles=%s" % (q, total, has_rag, titles[:5]))
'''

sftp2 = ssh.open_sftp()
with sftp2.file('/opt/blossom/web/_verify_all.py', 'w') as f:
    f.write(verify)
sftp2.close()

print('\n[VERIFY]')
i, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python /opt/blossom/web/_verify_all.py')
print(o.read().decode())
err = e.read().decode()
for line in err.strip().split('\n'):
    if any(k in line for k in ['Error', 'Traceback']):
        print('ERR:', line)
ssh.close()
print('[DONE]')
