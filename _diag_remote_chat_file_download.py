import paramiko

host='192.168.56.108'
user='root'
pw='123456'

ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)

cmd = r"""cd /opt/blossom/web && /opt/blossom/web/venv/bin/python - <<'PY'
from app import create_app
from app.models import MsgFile
import subprocess

app = create_app()
with app.app_context():
    rows = MsgFile.query.order_by(MsgFile.id.desc()).limit(5).all()
    print('rows=', len(rows))
    for r in rows:
        path = r.file_path or ''
        print('file', r.id, r.original_name, path)
        if path.startswith('/'):
            try:
                p = subprocess.run(['curl','-I','-sS','http://127.0.0.1:8080'+path], capture_output=True, text=True, timeout=10)
                first = (p.stdout or '').splitlines()[:3]
                print('curl:', '\\n'.join(first) if first else '(no headers)')
            except Exception as e:
                print('curl err', repr(e))
PY"""

_, so, se = ssh.exec_command(cmd, timeout=120)
out = so.read().decode('utf-8','ignore')
err = se.read().decode('utf-8','ignore').strip()
print(out or '(no stdout)')
print(err or '(no stderr)')
ssh.close()
