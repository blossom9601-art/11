#!/usr/bin/env python3
"""Fix NGINX port 9601 binding."""
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
    return rc, out, err

c = ssh("192.168.56.108")

# Check current NGINX state
print("=== Diagnosis ===")
rc, out, err = run(c, "nginx -t 2>&1")
print(f"nginx -t: rc={rc} | {out} | {err}")

rc, out, _ = run(c, "ss -tlnp | grep -E '9601|nginx'")
print(f"listening: {out}")

# SELinux port check
rc, out, _ = run(c, "semanage port -l | grep 9601")
print(f"SELinux port: {out}")

# Full restart nginx (not reload)
print("\n=== Restart NGINX ===")
run(c, "systemctl stop nginx")
time.sleep(1)
rc, out, err = run(c, "systemctl start nginx")
print(f"start: rc={rc} | {err}")
time.sleep(1)

rc, out, _ = run(c, "systemctl is-active nginx")
print(f"nginx status: {out}")

if out.strip() != "active":
    rc, out, _ = run(c, "journalctl -u nginx -n 20 --no-pager")
    print(f"journal:\n{out}")
    # Check if SELinux is blocking
    rc, out, _ = run(c, "ausearch -m AVC -ts recent 2>/dev/null | tail -10")
    print(f"SELinux AVC:\n{out}")

# Test binding
rc, out, _ = run(c, "ss -tlnp | grep -E '9601|nginx'")
print(f"listening after restart: {out}")

# Test curl
rc, out, _ = run(c, "curl -sk https://127.0.0.1:9601/health")
print(f"health: {out}")

c.close()
