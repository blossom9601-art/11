"""Restore dashboard stub files removed during RPM transition."""
import paramiko, time
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)

GUNICORN_CONF = '''import multiprocessing
bind = '127.0.0.1:8000'
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'sync'
timeout = 120
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
accesslog = '/var/log/blossom/lumina/web/access.log'
errorlog  = '/var/log/blossom/lumina/web/error.log'
loglevel  = 'info'
'''

WSGI = '''from web.app import create_app
application = create_app()
'''

INIT = '''"""Blossom Lumina WEB \xe2\x80\x94 Flask dashboard app factory (stub)."""
from flask import Flask

def create_app(config=None):
    app = Flask(__name__)
    app.config['DEBUG'] = False
    app.config['SESSION_COOKIE_SECURE'] = True
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    @app.route('/health')
    def health():
        return {'status': 'ok'}, 200
    return app
'''

CLI_API = '''from flask import Blueprint, jsonify
cli_api = Blueprint('cli_api', __name__, url_prefix='/api/cli')
@cli_api.route('/ping', methods=['GET'])
def ping():
    return jsonify({'status': 'ok'}), 200
'''

import base64
def push(remote, content):
    b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")
    cmd = f"mkdir -p $(dirname {remote}) && echo '{b64}' | base64 -d > {remote} && ls -l {remote}"
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode().rstrip())
    er = e.read().decode().rstrip()
    if er: print("STDERR:", er)

print("====== Restore stubs ======")
push("/opt/blossom/lumina/web/gunicorn.conf.py", GUNICORN_CONF)
push("/opt/blossom/lumina/web/wsgi.py", WSGI)
push("/opt/blossom/lumina/web/app/__init__.py", INIT)
push("/opt/blossom/lumina/web/app/cli_api.py", CLI_API)

def run(cmd):
    print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8","replace").rstrip())
    er = e.read().decode("utf-8","replace").rstrip()
    if er: print("STDERR:", er)

run("ls -l /opt/blossom/lumina/web/ /opt/blossom/lumina/web/app/")

print("\n====== Restart lumina-web ======")
run("systemctl restart lumina-web")
time.sleep(6)
run("systemctl is-active lumina-web")
run("systemctl status lumina-web --no-pager -l | head -22")
run(r"ss -tlnp | grep -E ':(80|443|8000|8001|9601)\b'")
run("pgrep -af gunicorn")
run("curl -sk -o /dev/null -w '443 -> %{http_code}\\n' https://127.0.0.1/api/auth/session-check")
run("curl -sk -o /dev/null -w '8000 -> %{http_code}\\n' http://127.0.0.1:8000/health")
run("curl -sk -o /dev/null -w '9601 -> %{http_code}\\n' https://127.0.0.1:9601/")

c.close()
print("\nDONE.")
