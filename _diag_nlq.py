"""Diagnose what API returns for natural language queries."""
import paramiko, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

diag = r'''
import sys, os, json
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

    queries = [
        "AI에 대해 설명해줘",
        "AI",
        "서버 관리 방법",
        "VPN 설정",
        "백업 정책 알려줘",
        "네트워크 장비",
        "프로젝트 현황 보여줘",
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
        titles = [row.get("title", "?")[:30] for row in rows[:3]]
        rag_text = (d.get("rag_answer",{}).get("answer_text","") or "")[:80]
        print("  [%s] total=%d rag=%s evid=%d titles=%s" % (q, total, has_rag, evid, titles))
        if rag_text:
            print("    rag_text: %s..." % rag_text)
'''

sftp = ssh.open_sftp()
with sftp.file('/opt/blossom/web/_diag_nlq.py', 'w') as f:
    f.write(diag)
sftp.close()

i, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python /opt/blossom/web/_diag_nlq.py')
print(o.read().decode())
err = e.read().decode()
for line in err.strip().split('\n'):
    if any(k in line for k in ['Error', 'Traceback']):
        print('ERR:', line)
ssh.close()
