#!/usr/bin/env python3
"""Deploy white-theme dashboard + logo to ttt3."""
import sys, os, time, base64
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

def put_binary(c, local, remote):
    sftp = c.open_sftp()
    sftp.put(local, remote)
    sftp.close()


c = ssh("192.168.56.108")

print("=" * 60)
print("Phase 1: Upload app_factory.py → __init__.py")
print("=" * 60)
src = os.path.join(PROJECT, "agents", "web", "app_factory.py")
dst = "/opt/blossom/lumina/web/app/__init__.py"
put_text(c, src, dst)
run(c, f"chcon -t httpd_sys_content_t {dst}")
print("  [OK] app updated")


print("\n" + "=" * 60)
print("Phase 2: Upload logo image")
print("=" * 60)
logo_src = os.path.join(PROJECT, "static", "image", "logo", "lumina_white.png")

# Flask serves static from /opt/blossom/lumina/web/static/
# Also create NGINX-served path for performance
for static_root in [
    "/opt/blossom/lumina/web/static",
    "/opt/blossom/lumina/web/app/static",
]:
    logo_dir = f"{static_root}/image/logo"
    run(c, f"mkdir -p {logo_dir}")
    logo_dst = f"{logo_dir}/lumina_white.png"
    put_binary(c, logo_src, logo_dst)
    run(c, f"chcon -R -t httpd_sys_content_t {static_root}")
    print(f"  [OK] logo → {logo_dst}")


print("\n" + "=" * 60)
print("Phase 3: Ensure NGINX serves /static/ from Flask static dir")
print("=" * 60)
# Check current NGINX config for static location
rc, out, _ = run(c, "grep -n 'location.*static' /etc/nginx/conf.d/lumina.conf", check=False)
if out:
    print(f"  existing static config:\n  {out}")
else:
    # Add static location block before the proxy_pass block
    print("  [INFO] Adding /static/ location to NGINX config...")
    nginx_patch = r"""
    # Static files
    location /static/ {
        alias /opt/blossom/lumina/web/app/static/;
        expires 1d;
    }
"""
    # Insert before the location / block
    run(c, f"""sed -i '/location \\/ {{/i \\    # Static files\\n    location /static/ {{\\n        alias /opt/blossom/lumina/web/app/static/;\\n        expires 1d;\\n    }}' /etc/nginx/conf.d/lumina.conf""")
    rc, _, err = run(c, "nginx -t", check=False)
    if rc == 0:
        run(c, "systemctl reload nginx")
        print("  [OK] NGINX config updated + reloaded")
    else:
        print(f"  [WARN] nginx -t failed: {err}")


print("\n" + "=" * 60)
print("Phase 4: Restart lumina-web")
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
print("Phase 5: E2E Verification")
print("=" * 60)

# Health
rc, out, _ = run(c, "curl -sk https://127.0.0.1/health")
print(f"  health: {out}")

# Logo accessible
rc, out, _ = run(c, "curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1/static/image/logo/lumina_white.png")
print(f"  logo HTTP: {out}")

# Login → dashboard
rc, out, _ = run(c, """
curl -sk -c /tmp/wt_cookie.txt -L \
  -d 'emp_no=admin&password=admin1234!' \
  https://127.0.0.1/login -o /tmp/wt_dash.html -w '%{http_code}'
""")
print(f"  login → dashboard: {out}")

# Verify white theme applied (background:#f1f5f9)
rc, out, _ = run(c, "grep -c 'f1f5f9' /tmp/wt_dash.html")
print(f"  white-theme markers: {out.strip()}")

# Logo in page
rc, out, _ = run(c, "grep -c 'lumina_white.png' /tmp/wt_dash.html")
print(f"  logo refs: {out.strip()}")

# Agent data rendered
rc, out, _ = run(c, "grep -oP 'font-weight:500\">[^<]+' /tmp/wt_dash.html | head -5")
print(f"  hostnames: {out}")

c.close()
print("\n" + "=" * 60)
print("DONE — https://192.168.56.108 새로고침")
print("=" * 60)
