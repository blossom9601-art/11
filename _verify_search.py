"""Deploy + verify search with proper session fields."""
import paramiko, os, time

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'
SERVICE = 'blossom-web'

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)

    # Already deployed api.py, just verify
    verify_script = '''
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

    queries = ["AI", "VPN", "서버", "보안", "블로그", "트렌드", "네트워크", "프로젝트", "DNS", "회사"]
    for q in queries:
        r = c.post("/api/search/unified",
                    json={"q": q, "limit": 10},
                    headers={"X-Requested-With": "XMLHttpRequest"},
                    content_type="application/json")
        d = r.get_json()
        if not d:
            print("  %s: NO JSON status=%d" % (q, r.status_code))
            continue
        total = d.get("total", 0)
        has_rag = bool(d.get("rag_answer"))
        evidence = len(d.get("rag_evidence", []))
        briefing = d.get("briefing", {})
        has_brief = bool(briefing.get("enabled"))
        rows = d.get("rows", [])
        titles = [row.get("title", "?")[:40] for row in rows[:5]]
        types = list(set(row.get("type", "") for row in rows))
        print("  %s: total=%d rag=%s evid=%d brief=%s types=%s" % (q, total, has_rag, evidence, has_brief, types))
        if titles:
            print("    titles: %s" % titles)
'''

    sftp = ssh.open_sftp()
    remote_verify = f'{REMOTE_BASE}/_verify_search.py'
    with sftp.file(remote_verify, 'w') as f:
        f.write(verify_script)
    sftp.close()

    print('[VERIFY]')
    stdin, stdout, stderr = ssh.exec_command(
        f'{REMOTE_BASE}/venv/bin/python {remote_verify}'
    )
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        lines = err.strip().split('\n')
        errors = [l for l in lines if 'Error' in l or 'Traceback' in l or 'Exception' in l]
        if errors:
            print('[ERRORS]', '\n'.join(errors[:10]))

    ssh.close()
    print('[DONE]')


if __name__ == '__main__':
    main()
