#!/usr/bin/env python3
"""Deploy SSR dashboard to ttt3 and verify."""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))

import paramiko

PROJECT = os.path.dirname(os.path.abspath(__file__))
SERVERS = {"ttt3": "192.168.56.108"}

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
        print(f"  [FAIL] rc={rc}\n  stdout: {out}\n  stderr: {err}")
    return rc, out, err

def put_file(c, local, remote):
    sftp = c.open_sftp()
    data = open(local, "r", encoding="utf-8").read().replace("\r\n", "\n")
    with sftp.file(remote, "w") as f:
        f.write(data)
    sftp.close()


print("=" * 60)
print("Phase 1: Upload updated app_factory.py → __init__.py")
print("=" * 60)
c = ssh(SERVERS["ttt3"])

src = os.path.join(PROJECT, "agents", "web", "app_factory.py")
dst = "/opt/blossom/lumina/web/app/__init__.py"
put_file(c, src, dst)
print(f"  [OK] {src} → {dst}")

# SELinux context
run(c, f"chcon -t httpd_sys_content_t {dst}")
print("  [OK] SELinux context set")

# Verify file header
rc, out, _ = run(c, f"head -3 {dst}")
print(f"  [OK] File header: {out[:80]}")


print("\n" + "=" * 60)
print("Phase 2: Restart lumina-web service")
print("=" * 60)
run(c, "systemctl restart lumina-web")
time.sleep(2)
rc, out, _ = run(c, "systemctl is-active lumina-web")
print(f"  lumina-web: {out}")

if out.strip() != "active":
    rc, out, _ = run(c, "journalctl -u lumina-web -n 20 --no-pager", check=False)
    print(f"  [JOURNAL]\n{out}")
    c.close()
    sys.exit(1)


print("\n" + "=" * 60)
print("Phase 3: E2E Verification")
print("=" * 60)

# Health check
rc, out, _ = run(c, "curl -sk https://127.0.0.1/health")
print(f"  health: {out}")

# Login + dashboard (cookie-based)
rc, out, _ = run(c, """
curl -sk -c /tmp/ssr_cookie.txt -L \
  -d 'emp_no=admin&password=admin1234!' \
  https://127.0.0.1/login -o /tmp/ssr_dash.html -w '%{http_code}'
""")
print(f"  login → dashboard HTTP: {out}")

# Check rendered content
rc, out, _ = run(c, "grep -c 'badge-' /tmp/ssr_dash.html")
badge_count = int(out.strip()) if out.strip().isdigit() else 0
print(f"  badge elements: {badge_count}")

rc, out, _ = run(c, "grep -c '<tr>' /tmp/ssr_dash.html")
tr_count = int(out.strip()) if out.strip().isdigit() else 0
print(f"  table rows: {tr_count}")

# Check if agents are rendered (not "로딩 중")
rc, out, _ = run(c, "grep -c '로딩' /tmp/ssr_dash.html")
loading_count = int(out.strip()) if out.strip().isdigit() else 0
if loading_count > 0:
    print(f"  [WARN] '로딩' text still found ({loading_count} times)")
else:
    print("  [OK] No '로딩' placeholder — data rendered server-side")

# Check for agent hostnames
rc, out, _ = run(c, "grep -oP 'font-weight:500\">[^<]+' /tmp/ssr_dash.html | head -5")
print(f"  hostnames: {out}")

# Check card values
rc, out, _ = run(c, "grep -oP 'num total\">[0-9]+' /tmp/ssr_dash.html")
print(f"  total count: {out}")

rc, out, _ = run(c, "grep -oP 'num pending\">[0-9]+' /tmp/ssr_dash.html")
print(f"  pending count: {out}")

rc, out, _ = run(c, "grep -oP 'num approved\">[0-9]+' /tmp/ssr_dash.html")
print(f"  approved count: {out}")

# Test approve action
rc, out, _ = run(c, """
curl -sk -b /tmp/ssr_cookie.txt -L \
  https://127.0.0.1/action/4/approve -o /tmp/ssr_action.html -w '%{http_code}'
""")
print(f"  approve action HTTP: {out}")

rc, out, _ = run(c, "grep -oP 'msg[^\"]*\">[^<]+' /tmp/ssr_action.html | head -1")
print(f"  action message: {out}")

c.close()
print("\n" + "=" * 60)
print("DONE — 브라우저에서 https://192.168.56.108 확인")
print("=" * 60)
