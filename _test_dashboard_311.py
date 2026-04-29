import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
def run(cmd):
    print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=120)
    print(o.read().decode("utf-8","replace").rstrip())
    er = e.read().decode("utf-8","replace").rstrip()
    if er: print("STDERR:", er)

# Try importing dashboard wsgi via python3.11 venv
test = """
cd /opt/blossom/lumina/web
set -a; [ -f /etc/blossom/lumina/secure.env ] && . /etc/blossom/lumina/secure.env; set +a
/opt/blossom/web/venv/bin/python - <<'PYEOF'
import sys, traceback
try:
    import wsgi
    print("IMPORT_OK", type(wsgi.application).__name__)
except Exception:
    traceback.print_exc()
    sys.exit(2)
PYEOF
"""
run(test)
c.close()
