"""
Merge lumina-dashboard into lumina-web — single systemd unit only.

- Wrapper /usr/local/bin/lumina-web-start.sh: starts dashboard gunicorn in background, execs main lumina-web gunicorn in foreground.
- lumina-web.service runs as root (dashboard needs /etc/blossom/lumina/secure.env which is root-owned).
- lumina-dashboard.service deleted + masked.
"""
import paramiko, time, sys

HOST = "192.168.56.108"

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
    return c

def run(c, cmd, check=False, quiet=False):
    if not quiet: print(f"\n$ {cmd[:200]}")
    _, out, err = c.exec_command(cmd, timeout=60)
    rc = out.channel.recv_exit_status()
    o = out.read().decode("utf-8","replace").rstrip()
    e = err.read().decode("utf-8","replace").rstrip()
    if o and not quiet: print(o)
    if e and not quiet: print("STDERR:", e)
    if check and rc != 0: print(f"!!! exit {rc}"); sys.exit(1)
    return rc, o, e

c = ssh()

WRAPPER = r"""#!/bin/bash
# Single-service wrapper: dashboard (8000) backgrounded, main lumina-web (8001) foreground.
set -e

# Source dashboard env (MariaDB credentials etc.)
if [ -f /etc/blossom/lumina/secure.env ]; then
  set -a
  . /etc/blossom/lumina/secure.env
  set +a
fi
export FLASK_ENV=production
export PYTHONDONTWRITEBYTECODE=1

# Start Lumina Dashboard (Flask, python3.6) in background
/usr/local/bin/gunicorn \
    --config /opt/blossom/lumina/web/gunicorn.conf.py \
    --chdir /opt/blossom/lumina/web \
    wsgi:application &
DASH_PID=$!

# Forward signals + cleanup
cleanup() {
    if kill -0 "$DASH_PID" 2>/dev/null; then
        kill -TERM "$DASH_PID" 2>/dev/null || true
        wait "$DASH_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT
trap 'cleanup; exit 143' TERM INT

# Run main Lumina Web (asset mgmt + chat, python3.11) in foreground
exec /opt/blossom/web/venv/bin/gunicorn \
    --config /opt/blossom/web/gunicorn_blossom.conf.py \
    wsgi:application
"""

UNIT = """[Unit]
Description=Lumina Web (Asset Mgmt + Chat + Dashboard)
After=network-online.target
Wants=network-online.target nginx.service

[Service]
Type=simple
User=root
Group=root
EnvironmentFile=-/etc/blossom/lumina/secure.env
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/usr/local/bin/lumina-web-start.sh
ExecReload=/bin/kill -HUP $MAINPID
KillMode=mixed
Restart=on-failure
RestartSec=5
TimeoutStartSec=60
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lumina-web

[Install]
WantedBy=multi-user.target
"""

print("====== STEP 0: snapshot ======")
run(c, "systemctl is-active lumina-web lumina-dashboard 2>&1")
run(c, "ls /etc/systemd/system/ | grep -E 'lumina|blossom'")

print("\n====== STEP 1: stop both services ======")
run(c, "systemctl stop lumina-web lumina-dashboard 2>&1")

print("\n====== STEP 2: write wrapper ======")
# Use base64 to avoid quoting hell
import base64
b64 = base64.b64encode(WRAPPER.encode("utf-8")).decode("ascii")
run(c, f"echo '{b64}' | base64 -d > /usr/local/bin/lumina-web-start.sh && chmod +x /usr/local/bin/lumina-web-start.sh && ls -l /usr/local/bin/lumina-web-start.sh")

print("\n====== STEP 3: replace lumina-web.service unit (single, runs both) ======")
b64u = base64.b64encode(UNIT.encode("utf-8")).decode("ascii")
run(c, "rm -rf /etc/systemd/system/lumina-web.service.d")  # secret.conf no longer needed (env file used)
run(c, f"echo '{b64u}' | base64 -d > /etc/systemd/system/lumina-web.service && cat /etc/systemd/system/lumina-web.service")

print("\n====== STEP 4: ensure SECRET_KEY available in env file ======")
# blossom-web needed SECRET_KEY=...; preserve via secure.env
run(c, """
if ! grep -q '^SECRET_KEY=' /etc/blossom/lumina/secure.env 2>/dev/null; then
  echo 'SECRET_KEY=c3b7109c88aca64b91376e63b5c57c74c5846ee54a90398d6ea911d2b1483d55' >> /etc/blossom/lumina/secure.env
  echo 'added SECRET_KEY'
else
  echo 'SECRET_KEY already present'
fi
chmod 600 /etc/blossom/lumina/secure.env
""")

print("\n====== STEP 5: remove lumina-dashboard service ======")
run(c, "systemctl disable lumina-dashboard 2>&1; systemctl stop lumina-dashboard 2>&1; rm -f /etc/systemd/system/lumina-dashboard.service; rm -rf /etc/systemd/system/lumina-dashboard.service.d; systemctl mask lumina-dashboard 2>&1")

print("\n====== STEP 6: daemon-reload + enable + start ======")
run(c, "systemctl daemon-reload")
run(c, "systemctl enable lumina-web 2>&1")
run(c, "systemctl restart lumina-web")
time.sleep(5)

print("\n====== STEP 7: verify single unit + both ports ======")
run(c, "systemctl is-active lumina-web 2>&1")
run(c, "systemctl status lumina-web --no-pager -l | head -25")
run(c, "ss -tlnp | grep -E ':(8000|8001|443|9601|80)\\b'")
run(c, "systemctl list-unit-files | grep -E 'lumina|blossom'")
run(c, "pgrep -af gunicorn | head -10")

print("\n====== STEP 8: smoke test ======")
run(c, "curl -sk -o /dev/null -w '443/api/auth/session-check -> HTTP %{http_code}\\n' https://127.0.0.1/api/auth/session-check")
run(c, "curl -sk -o /dev/null -w '9601/ -> HTTP %{http_code}\\n' https://127.0.0.1:9601/")

c.close()
print("\nDONE.")
