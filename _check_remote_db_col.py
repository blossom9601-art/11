import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)

# sqlite3 CLI로 직접 컬럼 목록 조회
cmd = "sqlite3 /opt/blossom/web/instance/access_control.db 'PRAGMA table_info(web_access_request);' 2>&1"
_, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', 'replace').strip()
err = stderr.read().decode('utf-8', 'replace').strip()
code = stdout.channel.recv_exit_status()
print('exit', code)
print(out)
if err:
    print('STDERR:', err)
cmd2 = "find /opt/blossom/web/instance -name '*.db' 2>/dev/null"
_, stdout2, _ = ssh.exec_command(cmd2)
print('DB files:', stdout2.read().decode('utf-8', 'replace').strip())
ssh.close()
raise SystemExit(0)

SCRIPT = (
    "from app.services import web_access_control_service as svc; "
    "from flask import Flask; "
    "app = Flask('check'); "
    "app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////opt/blossom/web/instance/access_control.db'; "
    "ctx = app.app_context(); ctx.push(); "
    "svc.init_web_access_control_tables(app); "
    "conn = svc._get_connection(app).__enter__(); "
    "cols = [r[1] for r in conn.execute('PRAGMA table_info(web_access_request)').fetchall()]; "
    "print('request_type_column', 'request_type' in cols)"
)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)
cmd = f"cd /opt/blossom/web && .venv/bin/python3 -c {SCRIPT!r}"
_, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', 'replace').strip()
err = stderr.read().decode('utf-8', 'replace').strip()
code = stdout.channel.recv_exit_status()
print('exit', code)
print(out)
if err:
    print('STDERR:', err[-2000:])
ssh.close()
