"""Deploy search fix v4 + verify with correct session."""
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
    sftp = ssh.open_sftp()

    local_base = os.path.dirname(os.path.abspath(__file__))
    local_path = os.path.join(local_base, 'app', 'routes', 'api.py')
    remote_path = f'{REMOTE_BASE}/app/routes/api.py'
    print('[DEPLOY] api.py')
    sftp.put(local_path, remote_path)
    sftp.close()

    print(f'[RESTART] {SERVICE}...')
    stdin, stdout, stderr = ssh.exec_command(f'systemctl restart {SERVICE}')
    stdout.read()
    time.sleep(3)

    # Verify using session_transaction (bypass login)
    verify_script = '''
import sys, os
sys.path.insert(0, "/opt/blossom/web")
os.chdir("/opt/blossom/web")
os.environ["FLASK_APP"] = "run.py"

from app import create_app
app = create_app()

with app.test_client() as c:
    with c.session_transaction() as sess:
        sess["user_id"] = 1
        sess["emp_no"] = "ADMIN"
        sess["role"] = "ADMIN"

    queries = ["AI", "VPN", "서버", "보안", "블로그", "트렌드", "네트워크", "프로젝트"]
    for q in queries:
        r = c.post("/api/search/unified",
                    json={"q": q, "limit": 10},
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
        titles = [row.get("title", "?")[:30] for row in rows[:5]]
        types = list(set(row.get("type", "") for row in rows))
        print("  %s: total=%d rag=%s evid=%d brief=%s types=%s" % (q, total, has_rag, evidence, has_brief, types))
        if titles:
            print("    titles: %s" % titles)
        if briefing.get("summary_lines"):
            print("    briefing: %s" % briefing["summary_lines"][0][:60])
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
        errors = [l for l in lines if 'Error' in l or 'Traceback' in l or 'Exception' in l]
        if errors:
            print('[ERRORS]', '\n'.join(errors[:5]))

    ssh.close()
    print('[DONE]')


if __name__ == '__main__':
    main()
