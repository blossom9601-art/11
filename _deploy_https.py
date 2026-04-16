#!/usr/bin/env python3
"""Deploy HTTPS + password changes to ttt servers."""
import os
import paramiko

BASE = os.path.dirname(__file__)
SERVERS = {
    "ttt1": "192.168.56.107",
    "ttt2": "192.168.56.106",
    "ttt3": "192.168.56.108",
    "ttt4": "192.168.56.109",
}

def ssh_connect(ip):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(ip, username="root", password="123456")
    return c

def run(c, cmd, label=""):
    _, o, e = c.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        for line in out.split("\n"):
            print(f"  [{label}] {line}")
    if err:
        for line in err.split("\n"):
            print(f"  [{label}] STDERR: {line}")
    return out


# ── 1. Deploy cli.py to ALL servers ──
cli_path = os.path.join(BASE, "agents", "common", "cli.py")
for name, ip in SERVERS.items():
    c = ssh_connect(ip)
    sftp = c.open_sftp()
    sftp.put(cli_path, "/opt/blossom/lumina/common/cli.py")
    sftp.close()
    print(f"[{name}] cli.py updated")
    c.close()

# ── 2. Deploy cli_api.py + NGINX config to ttt3, restart ──
print("\n=== ttt3: CLI API + HTTPS ===")
c3 = ssh_connect("192.168.56.108")
sftp = c3.open_sftp()

# Upload cli_api.py
cli_api_path = os.path.join(BASE, "agents", "web", "cli_api.py")
sftp.put(cli_api_path, "/opt/blossom/lumina/web/app/cli_api.py")
print("[ttt3] cli_api.py updated")

# Upload NGINX config
nginx_path = os.path.join(BASE, "deploy", "nginx", "lumina.conf")
sftp.put(nginx_path, "/etc/nginx/conf.d/lumina.conf")
print("[ttt3] lumina.conf updated")
sftp.close()

# Test NGINX config
run(c3, "nginx -t 2>&1", "ttt3")

# Restart NGINX
run(c3, "systemctl restart nginx 2>&1", "ttt3")

# Restart lumina-web (to pick up cli_api.py password change)
run(c3, "systemctl restart lumina-web 2>&1", "ttt3")

import time
time.sleep(3)

# Verify services
run(c3, "systemctl is-active nginx lumina-web", "ttt3")

# Test HTTPS
run(c3, "curl -sk https://127.0.0.1/health 2>&1", "ttt3")

# Test HTTP health (local only)
run(c3, "curl -s http://127.0.0.1/health 2>&1", "ttt3")

# Test HTTP redirect
run(c3, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ 2>&1", "ttt3")

# Test CLI login with new password
run(c3, 'curl -sk -X POST -H "Content-Type: application/json" '
        '-d \'{"emp_no":"admin","password":"admin1234!"}\' '
        'https://127.0.0.1/api/cli/login 2>&1', "ttt3")

# Verify old password fails
run(c3, 'curl -sk -X POST -H "Content-Type: application/json" '
        '-d \'{"emp_no":"admin","password":"Lumina_Admin_2026!"}\' '
        'https://127.0.0.1/api/cli/login 2>&1', "ttt3")

c3.close()
print("\nDone.")
