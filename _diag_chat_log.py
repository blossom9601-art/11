import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=20)
# venv python으로 직접 시뮬레이션
script = '''
import sys
sys.path.insert(0, "/opt/blossom/web")
from app import create_app, db
app = create_app()
with app.app_context():
    print("DB URL:", str(db.engine.url))
    rs = db.session.execute(db.text("SELECT name FROM sqlite_master WHERE type=\\"table\\" AND name LIKE \\"msg_%\\"")).fetchall()
    print("msg tables:", rs)
    # row counts
    for t in ("msg_room","msg_room_member","msg_message","msg_pinned_message","msg_message_reaction"):
        try:
            n = db.session.execute(db.text(f"SELECT COUNT(*) FROM {t}")).scalar()
            print(t, "->", n)
        except Exception as e:
            print(t, "ERR", e)
'''
import shlex
cmd = '/opt/blossom/web/venv/bin/python -c ' + shlex.quote(script)
_, o, e = ssh.exec_command(cmd)
print('STDOUT:'); print(o.read().decode('utf-8','replace'))
print('STDERR:'); print(e.read().decode('utf-8','replace')[-3000:])

# 진짜 최신 로그/에러
print('===== latest journal blossom-web (last 5min) =====')
_, o, _ = ssh.exec_command("journalctl -u blossom-web --since '10 minutes ago' --no-pager | tail -200")
print(o.read().decode('utf-8','replace'))
print('===== access log latest 5 lines =====')
_, o, _ = ssh.exec_command("ls -laht /var/log/blossom/web/ | head -10; echo ---; tail -5 /var/log/blossom/web/blossom_access.log; echo ---error---; tail -50 /var/log/blossom/web/blossom_error.log")
print(o.read().decode('utf-8','replace'))
ssh.close()
