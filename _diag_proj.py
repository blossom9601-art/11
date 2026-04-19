"""Diagnose why 프로젝트 search returns 0 on production."""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

diag = r'''
import sys, os
sys.path.insert(0, "/opt/blossom/web")
os.chdir("/opt/blossom/web")
os.environ["FLASK_APP"] = "run.py"

# 1) Check _KEY_MENU_CODE
from app.routes.pages import _KEY_MENU_CODE, _resolve_menu_code, TEMPLATE_MAP

print("=== _KEY_MENU_CODE proj entries ===")
for k, v in _KEY_MENU_CODE.items():
    if 'proj' in k or 'task' in k or 'wf' in k or 'workflow' in k or 'project' in k:
        print("  %s -> %s" % (k, v))

print("\n=== TEMPLATE_MAP proj/task/wf keys ===")
proj_keys = [k for k in TEMPLATE_MAP if k.startswith(('proj_', 'task_', 'wf_', 'workflow_'))]
for k in proj_keys:
    mc = _resolve_menu_code(k)
    print("  %s -> menu_code=%s" % (k, mc))

# 2) Check menu table
from app import create_app
app = create_app()
with app.app_context():
    from app.models import Menu
    rows = Menu.query.filter(Menu.menu_code.like("project%")).all()
    print("\n=== Menu rows (project%) ===")
    for r in rows:
        print("  %s: %s" % (r.menu_code, r.menu_name))

# 3) Run actual search with debug
from datetime import datetime
with app.test_client() as c:
    with c.session_transaction() as sess:
        sess["user_id"] = 1
        sess["emp_no"] = "ADMIN"
        sess["role"] = "ADMIN"
        sess["_login_at"] = datetime.utcnow().isoformat()
        sess["_last_active"] = datetime.utcnow().isoformat()

    r = c.post("/api/search/unified",
               json={"q": "프로젝트", "limit": 20},
               headers={"X-Requested-With": "XMLHttpRequest"},
               content_type="application/json")
    d = r.get_json()
    if d:
        print("\n=== Search result ===")
        print("  total=%d" % d.get("total", 0))
        for row in d.get("rows", []):
            print("  -> %s (%s) route=%s" % (row.get("title"), row.get("type"), row.get("route")))
    else:
        print("\n=== NO JSON, status=%d ===" % r.status_code)
        print("  body[:500]:", r.data[:500])
'''

sftp = ssh.open_sftp()
with sftp.file('/opt/blossom/web/_diag_proj.py', 'w') as f:
    f.write(diag)
sftp.close()

i, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python /opt/blossom/web/_diag_proj.py')
print(o.read().decode())
err = e.read().decode()
for line in err.strip().split('\n'):
    if any(k in line for k in ['Error', 'Traceback', 'raise', 'CRITICAL']):
        print('ERR:', line)
ssh.close()
