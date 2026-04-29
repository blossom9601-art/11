"""
Rename systemd units on ttt3 (192.168.56.108):
- /usr/lib/systemd/system/blossom-web.service       (port 8001, 자산관리/채팅) → /etc/systemd/system/lumina-web.service
- /etc/systemd/system/lumina-web.service            (port 8000, Dashboard)     → /etc/systemd/system/lumina-dashboard.service

기존 nginx, 포트, 코드, 데이터 그대로 유지. 데몬 이름만 변경.
"""
import paramiko, time, sys

HOST = "192.168.56.108"

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
    return c

def run(c, cmd, check=True, quiet=False):
    if not quiet:
        print(f"\n$ {cmd}")
    stdin, out, err = c.exec_command(cmd, timeout=60)
    rc = out.channel.recv_exit_status()
    o = out.read().decode("utf-8","replace").rstrip()
    e = err.read().decode("utf-8","replace").rstrip()
    if o and not quiet: print(o)
    if e and not quiet: print("STDERR:", e)
    if check and rc != 0:
        print(f"!!! exit {rc}, abort")
        sys.exit(1)
    return rc, o, e

c = ssh()

print("====== STEP 0: snapshot before ======")
run(c, "systemctl is-active blossom-web lumina-web nginx 2>&1", check=False)
run(c, "ss -tlnp | grep -E ':(8000|8001|443|9601|80)\\b'", check=False)

print("\n====== STEP 1: stop blossom-web (already inactive) and lumina-web temporarily ======")
run(c, "systemctl stop blossom-web 2>&1", check=False)
run(c, "systemctl stop lumina-web 2>&1", check=False)
run(c, "systemctl disable blossom-web lumina-web 2>&1", check=False)

print("\n====== STEP 2: backup existing units ======")
run(c, "mkdir -p /root/_unit_backup_$(date +%Y%m%d_%H%M%S) && cp -av /usr/lib/systemd/system/blossom-web.service /etc/systemd/system/lumina-web.service /etc/systemd/system/blossom-web.service.d /etc/systemd/system/lumina-web.service.d /root/_unit_backup_*/  2>&1 || true", check=False)

print("\n====== STEP 3: rename current lumina-web (Dashboard, 8000) -> lumina-dashboard ======")
# Current /etc/systemd/system/lumina-web.service → lumina-dashboard.service
run(c, """
if [ -f /etc/systemd/system/lumina-web.service ]; then
  sed -e 's/SyslogIdentifier=lumina-web/SyslogIdentifier=lumina-dashboard/' \
      -e 's/Description=Blossom Lumina WEB Server (Gunicorn + Flask Dashboard)/Description=Lumina Dashboard (Gunicorn + Flask)/' \
      /etc/systemd/system/lumina-web.service > /etc/systemd/system/lumina-dashboard.service
  echo OK_dashboard_unit
fi
""", check=False)
# drop-in dir
run(c, """
if [ -d /etc/systemd/system/lumina-web.service.d ]; then
  rm -rf /etc/systemd/system/lumina-dashboard.service.d
  cp -a /etc/systemd/system/lumina-web.service.d /etc/systemd/system/lumina-dashboard.service.d
  echo OK_dashboard_dropin
fi
""", check=False)
# remove old lumina-web files
run(c, "rm -f /etc/systemd/system/lumina-web.service; rm -rf /etc/systemd/system/lumina-web.service.d; echo removed_old_lumina_web", check=False)

print("\n====== STEP 4: rename blossom-web (자산관리/채팅, 8001) -> lumina-web ======")
# Read original
rc, orig, _ = run(c, "cat /usr/lib/systemd/system/blossom-web.service", quiet=True)
# Build new lumina-web.service from blossom-web content
new_unit = orig.replace("Description=Blossom IT Asset Management (Gunicorn + Flask)",
                        "Description=Lumina Web (Gunicorn + Flask)") \
               .replace("SyslogIdentifier=blossom-web", "SyslogIdentifier=lumina-web")
# Write to /etc/systemd/system/lumina-web.service
import shlex
run(c, f"cat > /etc/systemd/system/lumina-web.service <<'__EOF__'\n{new_unit}\n__EOF__", quiet=True)
print("wrote /etc/systemd/system/lumina-web.service")
# Copy drop-in (SECRET_KEY etc)
run(c, """
if [ -d /etc/systemd/system/blossom-web.service.d ]; then
  rm -rf /etc/systemd/system/lumina-web.service.d
  cp -a /etc/systemd/system/blossom-web.service.d /etc/systemd/system/lumina-web.service.d
  echo OK_lumina_web_dropin
fi
""", check=False)

print("\n====== STEP 5: remove blossom-web unit (mask to prevent reappearance) ======")
run(c, "rm -f /usr/lib/systemd/system/blossom-web.service; rm -rf /etc/systemd/system/blossom-web.service.d; systemctl daemon-reload; systemctl mask blossom-web 2>&1", check=False)

print("\n====== STEP 6: daemon-reload + enable + start ======")
run(c, "systemctl daemon-reload", check=False)
run(c, "systemctl enable lumina-web lumina-dashboard 2>&1", check=False)
run(c, "systemctl start lumina-dashboard", check=False)
run(c, "systemctl start lumina-web", check=False)
time.sleep(3)

print("\n====== STEP 7: verify ======")
run(c, "systemctl is-active lumina-web lumina-dashboard nginx 2>&1", check=False)
run(c, "ss -tlnp | grep -E ':(8000|8001|443|9601|80)\\b'", check=False)
run(c, "systemctl status lumina-web --no-pager -l | head -15", check=False)
run(c, "systemctl status lumina-dashboard --no-pager -l | head -15", check=False)
run(c, "systemctl list-unit-files | grep -E 'blossom|lumina'", check=False)

print("\n====== STEP 8: smoke test endpoints ======")
run(c, "curl -sk -o /dev/null -w '443/api/auth/session-check -> HTTP %{http_code}\\n' https://127.0.0.1/api/auth/session-check", check=False)
run(c, "curl -sk -o /dev/null -w '9601 root -> HTTP %{http_code}\\n' https://127.0.0.1:9601/", check=False)
run(c, "curl -s  -o /dev/null -w 'http 8000 root -> HTTP %{http_code}\\n' http://127.0.0.1:8000/", check=False)
run(c, "curl -s  -o /dev/null -w 'http 8001 session -> HTTP %{http_code}\\n' http://127.0.0.1:8001/api/auth/session-check", check=False)

c.close()
print("\nDONE.")
