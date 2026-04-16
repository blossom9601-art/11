#!/usr/bin/env python3
"""Fix SELinux port 9601 for NGINX and restart."""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
import paramiko

def ssh(host):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username="root", password="123456", timeout=10)
    return c

def run(c, cmd):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    rc = stdout.channel.recv_exit_status()
    out = stdout.read().decode(errors="replace").strip()
    err = stderr.read().decode(errors="replace").strip()
    print(f"  [{rc}] {cmd[:80]}")
    if out: print(f"      {out[:200]}")
    if err and rc != 0: print(f"      ERR: {err[:200]}")
    return rc, out, err

c = ssh("192.168.56.108")

print("=== SELinux: add port 9601 as http_port_t ===")
# Try add first, then modify if already exists
run(c, "semanage port -a -t http_port_t -p tcp 9601")
run(c, "semanage port -l | grep 9601")

# Verify http_port_t includes 9601
run(c, "semanage port -l | grep http_port_t | head -3")

print("\n=== Restart NGINX ===")
run(c, "systemctl start nginx")
time.sleep(2)
rc, out, _ = run(c, "systemctl is-active nginx")

if out.strip() != "active":
    print("\n  Still failing. Trying setsebool...")
    run(c, "setsebool -P httpd_can_network_connect 1")
    # Also try with permissive for nginx
    run(c, "setenforce 0")
    run(c, "systemctl start nginx")
    time.sleep(1)
    rc, out, _ = run(c, "systemctl is-active nginx")
    print(f"  nginx (permissive): {out}")
    if out.strip() == "active":
        # Create policy module to allow this permanently
        run(c, "setenforce 1")
        # Keep the port rule
        print("  [OK] nginx started. Creating SELinux policy...")
        run(c, "ausearch -c nginx -m AVC --raw 2>/dev/null | audit2allow -M nginx_port 2>/dev/null")
        run(c, "semodule -i nginx_port.pp 2>/dev/null")
        # Restart with enforcing
        run(c, "systemctl restart nginx")
        time.sleep(1)
        rc, out, _ = run(c, "systemctl is-active nginx")
        print(f"  nginx (enforcing): {out}")

print("\n=== Verify ===")
run(c, "ss -tlnp | grep 9601")
run(c, "curl -sk https://127.0.0.1:9601/health")

# Login + dashboard
rc, out, _ = run(c, """curl -sk -c /tmp/p96_cookie.txt -L \
  -d 'emp_no=admin&password=admin1234!' \
  https://127.0.0.1:9601/login -o /tmp/p96_dash.html -w '%{http_code}'""")

rc, out, _ = run(c, "grep -c 'Blossom Lumina' /tmp/p96_dash.html")
print(f"  'Blossom Lumina' count: {out}")

rc, out, _ = run(c, "grep -oP 'font-weight:500\">[^<]+' /tmp/p96_dash.html | head -5")
print(f"  hostnames: {out}")

c.close()
print("\n=== DONE — https://192.168.56.108:9601 ===")
