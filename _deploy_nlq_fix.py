"""Deploy keyword tokenization fix + frontend RAG display fix."""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

sftp = ssh.open_sftp()
sftp.put(r'c:\Users\ME\Desktop\blossom\app\routes\api.py',
         '/opt/blossom/web/app/routes/api.py')
print('[OK] api.py')
sftp.put(r'c:\Users\ME\Desktop\blossom\app\routes\pages.py',
         '/opt/blossom/web/app/routes/pages.py')
print('[OK] pages.py')
sftp.put(r'c:\Users\ME\Desktop\blossom\static\js\addon_application\5.search.js',
         '/opt/blossom/web/static/js/addon_application/5.search.js')
print('[OK] 5.search.js')
sftp.close()

i, o, e = ssh.exec_command('systemctl restart blossom-web')
o.read(); e.read()
print('[OK] restarted')
time.sleep(3)

# Verify natural language queries
verify = r'''
import sys, os, json
sys.path.insert(0, "/opt/blossom/web")
os.chdir("/opt/blossom/web")
os.environ["FLASK_APP"] = "run.py"
from datetime import datetime
from app import create_app
from app.routes.api import _extract_search_keywords
app = create_app()

# Show keyword extraction
test_queries = [
    "AI에 대해 설명해줘",
    "서버 관리 방법",
    "VPN 설정",
    "백업 정책 알려줘",
    "프로젝트 현황 보여줘",
    "대시보드 보여줘",
]
print("=== Keyword Extraction ===")
for tq in test_queries:
    kw = _extract_search_keywords(tq)
    print("  %s -> %s" % (tq, kw))

print("\n=== Search Results ===")
with app.test_client() as c:
    with c.session_transaction() as sess:
        sess["user_id"] = 1
        sess["emp_no"] = "ADMIN"
        sess["role"] = "ADMIN"
        sess["_login_at"] = datetime.utcnow().isoformat()
        sess["_last_active"] = datetime.utcnow().isoformat()

    queries = [
        "AI에 대해 설명해줘",
        "AI",
        "서버 관리 방법",
        "VPN 설정",
        "백업 정책 알려줘",
        "네트워크 장비",
        "프로젝트 현황 보여줘",
        "대시보드 보여줘",
        "회사 정보",
        "취약점 분석",
    ]
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
        has_rag = bool(d.get("rag_answer",{}).get("answer_text"))
        evid = len(d.get("rag_evidence", []))
        rows = d.get("rows", [])
        titles = list(set(row.get("title", "?")[:30] for row in rows[:5]))
        rag_text = (d.get("rag_answer",{}).get("answer_text","") or "")[:80]
        print("  [%s] total=%d rag=%s evid=%d titles=%s" % (q, total, has_rag, evid, titles))
        if rag_text:
            print("    rag: %s..." % rag_text)
'''

sftp2 = ssh.open_sftp()
with sftp2.file('/opt/blossom/web/_verify_nlq.py', 'w') as f:
    f.write(verify)
sftp2.close()

print('\n[VERIFY]')
i, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python /opt/blossom/web/_verify_nlq.py')
print(o.read().decode())
err = e.read().decode()
for line in err.strip().split('\n'):
    if any(k in line for k in ['Error', 'Traceback']):
        print('ERR:', line)
ssh.close()
print('[DONE]')
