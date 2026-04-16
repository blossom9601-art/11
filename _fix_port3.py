#!/usr/bin/env python3
"""Install semanage, add port 9601 for NGINX, restart with enforcing."""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
import paramiko

def ssh(host):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username="root", password="123456", timeout=10)
    return c

def run(c, cmd, timeout=60):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    rc = stdout.channel.recv_exit_status()
    out = stdout.read().decode(errors="replace").strip()
    err = stderr.read().decode(errors="replace").strip()
    return rc, out, err

c = ssh("192.168.56.108")

# Step 1: Install policycoreutils-python-utils (provides semanage)
print("Step 1: Install semanage...")
rc, out, err = run(c, "yum install -y policycoreutils-python-utils 2>&1 | tail -3", timeout=120)
print(f"  rc={rc} | {out}")

# Step 2: Add port 9601 to http_port_t
print("\nStep 2: Add SELinux port 9601...")
rc, out, err = run(c, "semanage port -a -t http_port_t -p tcp 9601 2>&1 || semanage port -m -t http_port_t -p tcp 9601 2>&1")
print(f"  rc={rc} | {out} | {err}")

rc, out, _ = run(c, "semanage port -l | grep 9601")
print(f"  verify: {out}")

# Step 3: Make sure enforcing
print("\nStep 3: SELinux enforcing...")
run(c, "setenforce 1")
rc, out, _ = run(c, "getenforce")
print(f"  mode: {out}")

# Step 4: Restart nginx
print("\nStep 4: Restart NGINX...")
run(c, "systemctl restart nginx")
time.sleep(2)
rc, out, _ = run(c, "systemctl is-active nginx")
print(f"  nginx: {out}")

if out.strip() != "active":
    rc, out, _ = run(c, "journalctl -u nginx -n 10 --no-pager")
    print(f"  journal:\n{out}")
    c.close()
    sys.exit(1)

# Step 5: Verify
print("\nStep 5: Verify...")
rc, out, _ = run(c, "ss -tlnp | grep 9601")
print(f"  listening: {out}")

rc, out, _ = run(c, "curl -sk https://127.0.0.1:9601/health")
print(f"  health: {out}")

# Login + dashboard
run(c, """curl -sk -c /tmp/p96_cookie.txt -L \
  -d 'emp_no=admin&password=admin1234!' \
  https://127.0.0.1:9601/login -o /tmp/p96_dash.html -w '%{http_code}'""")

rc, out, _ = run(c, "grep -c 'Blossom Lumina' /tmp/p96_dash.html")
print(f"  'Blossom Lumina' count: {out if out else '0'}")

rc, out, _ = run(c, "grep -oP 'font-weight:500\">[^<]+' /tmp/p96_dash.html | head -5")
print(f"  hostnames: {out}")

rc, out, _ = run(c, "grep -oP 'height:[0-9]+px' /tmp/p96_dash.html | head -3")
print(f"  logo heights: {out}")

c.close()
print("\nDONE — https://192.168.56.108:9601")
