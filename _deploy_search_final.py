"""Deploy search quality fix - final version.

Changes:
1. Blog search includes content_html body text
2. InsightItem search via db.session (same SQLAlchemy DB)
3. Page route search enabled by default (always)
4. stage3_rules import fix (sys.path + __init__.py)
5. Briefing fallback already works
"""
import paramiko, os, time

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'
SERVICE = 'blossom-web'

LOCAL_FILES = {
    'app/routes/api.py':          f'{REMOTE_BASE}/app/routes/api.py',
    'scripts/__init__.py':        f'{REMOTE_BASE}/scripts/__init__.py',
    'scripts/ai_briefing/__init__.py': f'{REMOTE_BASE}/scripts/ai_briefing/__init__.py',
}

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    local_base = os.path.dirname(os.path.abspath(__file__))

    for local_rel, remote_path in LOCAL_FILES.items():
        local_path = os.path.join(local_base, local_rel)
        if not os.path.exists(local_path):
            print(f'[SKIP] {local_rel} not found')
            continue
        # Ensure remote dir exists
        remote_dir = os.path.dirname(remote_path).replace('\\', '/')
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            try:
                sftp.mkdir(remote_dir)
            except Exception:
                pass
        print(f'[DEPLOY] {local_rel}')
        sftp.put(local_path, remote_path)

    sftp.close()

    # Restart
    print(f'\n[RESTART] {SERVICE}...')
    stdin, stdout, stderr = ssh.exec_command(f'systemctl restart {SERVICE}')
    stdout.read()
    time.sleep(3)

    # Verify
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

    queries = ["AI", "VPN", "서버", "보안", "블로그", "트렌드", "프로젝트", "회사"]
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
        brief_mode = briefing.get("mode", "?")
        rows = d.get("rows", [])
        types = list(set(row.get("type", "") for row in rows))
        titles_unique = []
        seen_t = set()
        for row in rows[:8]:
            t = row.get("title", "?")[:30]
            if t not in seen_t:
                seen_t.add(t)
                titles_unique.append(t)
        print("  %s: total=%d rag=%s evid=%d brief=%s(%s) types=%s" % (q, total, has_rag, evidence, has_brief, brief_mode, types))
        if titles_unique:
            print("    titles: %s" % titles_unique)
'''

    sftp2 = ssh.open_sftp()
    remote_verify = f'{REMOTE_BASE}/_verify_search.py'
    with sftp2.file(remote_verify, 'w') as f:
        f.write(verify_script)
    sftp2.close()

    print('\n[VERIFY]')
    stdin, stdout, stderr = ssh.exec_command(
        f'{REMOTE_BASE}/venv/bin/python {remote_verify}'
    )
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        lines = err.strip().split('\n')
        errors = [l for l in lines if 'Error' in l or 'Traceback' in l]
        if errors:
            print('[ERRORS]', '\n'.join(errors[:5]))
        else:
            print('[stderr] (no errors, startup noise only)')

    ssh.close()
    print('\n[DONE]')


if __name__ == '__main__':
    main()
