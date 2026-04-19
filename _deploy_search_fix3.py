"""Deploy search fix v3 + verify."""
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
    print(f'[DEPLOY] api.py')
    sftp.put(local_path, remote_path)
    sftp.close()

    # Restart
    print(f'[RESTART] {SERVICE}...')
    stdin, stdout, stderr = ssh.exec_command(f'systemctl restart {SERVICE}')
    stdout.read()
    time.sleep(3)

    # Verify with detailed output
    verify_script = '''
import sys, os
sys.path.insert(0, "/opt/blossom/web")
os.chdir("/opt/blossom/web")
os.environ["FLASK_APP"] = "run.py"

from app import create_app
app = create_app()

with app.test_client() as c:
    # Login
    login_resp = c.post("/api/login", json={"username": "admin", "password": "admin"})
    ld = login_resp.get_json()
    print("Login: status=%d success=%s" % (login_resp.status_code, ld.get("success") if ld else "N/A"))

    if not ld or not ld.get("success"):
        print("Login failed, trying other passwords...")
        for pw in ["Admin123!", "password", "1234"]:
            r2 = c.post("/api/login", json={"username": "admin", "password": pw})
            d2 = r2.get_json()
            if d2 and d2.get("success"):
                print("  OK with password: %s" % pw)
                break
            print("  Failed: %s" % pw)

    # Search tests
    queries = ["AI", "VPN", "서버", "보안", "블로그", "트렌드"]
    for q in queries:
        r = c.post("/api/search/unified", json={"q": q, "limit": 10})
        d = r.get_json()
        if not d:
            print("  %s: NO JSON RESPONSE status=%d" % (q, r.status_code))
            continue
        total = d.get("total", 0)
        has_rag = bool(d.get("rag_answer"))
        evidence = len(d.get("rag_evidence", []))
        has_brief = bool(d.get("briefing", {}).get("enabled"))
        titles = [row.get("title", "?")[:30] for row in d.get("rows", [])[:5]]
        print("  %s: total=%d rag=%s evid=%d brief=%s titles=%s" % (q, total, has_rag, evidence, has_brief, titles))
'''

    sftp2 = ssh.open_sftp()
    remote_verify = f'{REMOTE_BASE}/_verify_search.py'
    with sftp2.file(remote_verify, 'w') as f:
        f.write(verify_script)
    sftp2.close()

    print('\n[VERIFY] Search tests...')
    stdin, stdout, stderr = ssh.exec_command(
        f'{REMOTE_BASE}/venv/bin/python {remote_verify}'
    )
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        # Filter out startup noise
        lines = err.split('\n')
        important = [l for l in lines if 'Error' in l or 'Traceback' in l or 'error' in l.lower()]
        if important:
            print(f'[STDERR] {chr(10).join(important[:5])}')

    ssh.close()
    print('[DONE]')


if __name__ == '__main__':
    main()
