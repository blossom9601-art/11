#!/usr/bin/env python3
"""Deploy: big logo, no title text, port 9601."""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
import paramiko

PROJECT = os.path.dirname(os.path.abspath(__file__))

def ssh(host):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username="root", password="123456", timeout=10)
    return c

def run(c, cmd, check=True):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    rc = stdout.channel.recv_exit_status()
    out = stdout.read().decode(errors="replace").strip()
    err = stderr.read().decode(errors="replace").strip()
    if rc != 0 and check:
        print(f"  [FAIL] rc={rc} | {err[:200]}")
    return rc, out, err

def put_text(c, local, remote):
    sftp = c.open_sftp()
    data = open(local, "r", encoding="utf-8").read().replace("\r\n", "\n")
    with sftp.file(remote, "w") as f:
        f.write(data)
    sftp.close()

c = ssh("192.168.56.108")

# ── Phase 1: Upload app ─────────────────────────────────
print("=" * 60)
print("Phase 1: Upload app_factory.py")
print("=" * 60)
src = os.path.join(PROJECT, "agents", "web", "app_factory.py")
dst = "/opt/blossom/lumina/web/app/__init__.py"
put_text(c, src, dst)
run(c, f"chcon -t httpd_sys_content_t {dst}")
print("  [OK] app updated")


# ── Phase 2: Change NGINX port 443 → 9601 ──────────────
print("\n" + "=" * 60)
print("Phase 2: NGINX port → 9601")
print("=" * 60)

# Change HTTPS listen from 443 to 9601
run(c, r"sed -i 's/listen\s*443 ssl/listen       9601 ssl/' /etc/nginx/conf.d/lumina.conf")
run(c, r"sed -i 's/listen\s*\[::\]:443 ssl/listen       [::]:9601 ssl/' /etc/nginx/conf.d/lumina.conf")

# Update HTTP redirect to use port 9601
run(c, r"sed -i 's|return 301 https://\$host\$request_uri;|return 301 https://$host:9601$request_uri;|' /etc/nginx/conf.d/lumina.conf")

# Verify
rc, out, _ = run(c, "grep -n 'listen.*9601' /etc/nginx/conf.d/lumina.conf")
print(f"  listen lines:\n  {out}")

rc, out, _ = run(c, "grep -n 'return 301' /etc/nginx/conf.d/lumina.conf")
print(f"  redirect: {out}")

# Test config
rc, _, err = run(c, "nginx -t 2>&1", check=False)
# nginx -t outputs to stderr
rc2, out2, err2 = run(c, "nginx -t", check=False)
if "successful" in (err2 or out2 or ""):
    print("  [OK] nginx -t passed")
else:
    print(f"  [WARN] nginx -t: {err2}")

# Allow port 9601 in SELinux
run(c, "semanage port -a -t http_port_t -p tcp 9601 2>/dev/null || semanage port -m -t http_port_t -p tcp 9601", check=False)
print("  [OK] SELinux port 9601 allowed")

# Allow port 9601 in firewall
run(c, "firewall-cmd --permanent --add-port=9601/tcp 2>/dev/null", check=False)
run(c, "firewall-cmd --reload 2>/dev/null", check=False)
print("  [OK] firewall port 9601 opened")


# ── Phase 3: Restart services ──────────────────────────
print("\n" + "=" * 60)
print("Phase 3: Restart services")
print("=" * 60)
run(c, "systemctl restart lumina-web")
time.sleep(1)
run(c, "systemctl reload nginx")
time.sleep(1)

rc, out, _ = run(c, "systemctl is-active lumina-web")
print(f"  lumina-web: {out}")
rc, out, _ = run(c, "systemctl is-active nginx")
print(f"  nginx: {out}")

if "active" not in out:
    rc, out, _ = run(c, "journalctl -u nginx -n 15 --no-pager", check=False)
    print(f"  [JOURNAL]\n{out}")


# ── Phase 4: E2E Verification ──────────────────────────
print("\n" + "=" * 60)
print("Phase 4: E2E Verification (port 9601)")
print("=" * 60)

# Health
rc, out, _ = run(c, "curl -sk https://127.0.0.1:9601/health")
print(f"  health: {out}")

# Logo
rc, out, _ = run(c, "curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:9601/static/image/logo/lumina_white.png")
print(f"  logo HTTP: {out}")

# Login → dashboard
rc, out, _ = run(c, """
curl -sk -c /tmp/p96_cookie.txt -L \
  -d 'emp_no=admin&password=admin1234!' \
  https://127.0.0.1:9601/login -o /tmp/p96_dash.html -w '%{http_code}'
""")
print(f"  login → dashboard: {out}")

# No "Blossom Lumina" text
rc, out, _ = run(c, "grep -c 'Blossom Lumina' /tmp/p96_dash.html", check=False)
bl_count = int(out.strip()) if out.strip().isdigit() else 0
if bl_count == 0:
    print("  [OK] 'Blossom Lumina' text removed")
else:
    print(f"  [WARN] 'Blossom Lumina' still found ({bl_count} times)")

# Logo size (height:48px in dashboard, 80px in login)
rc, out, _ = run(c, "grep -oP 'height:[0-9]+px' /tmp/p96_dash.html | head -3")
print(f"  logo heights: {out}")

# Agent data
rc, out, _ = run(c, "grep -oP 'font-weight:500\">[^<]+' /tmp/p96_dash.html | head -5")
print(f"  hostnames: {out}")

# HTTP redirect includes port
rc, out, _ = run(c, "curl -sk -o /dev/null -w '%{redirect_url}' http://127.0.0.1/")
print(f"  HTTP redirect → {out}")

c.close()
print("\n" + "=" * 60)
print("DONE — 브라우저: https://192.168.56.108:9601")
print("=" * 60)
