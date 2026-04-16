#!/usr/bin/env python3
"""Quick E2E verify on port 9601."""
import sys, os
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
    return rc, out

c = ssh("192.168.56.108")

# Login step by step
print("1. POST /login (no follow)")
rc, out = run(c, "curl -sk -c /tmp/v_cookie.txt -d 'emp_no=admin&password=admin1234!' https://127.0.0.1:9601/login -w '\\nHTTP:%{http_code} REDIRECT:%{redirect_url}' -o /dev/null")
print(f"   {out}")

print("\n2. GET / with cookie")
rc, out = run(c, "curl -sk -b /tmp/v_cookie.txt https://127.0.0.1:9601/ -o /tmp/v_dash.html -w 'HTTP:%{http_code} SIZE:%{size_download}'")
print(f"   {out}")

print("\n3. Dashboard content")
rc, out = run(c, "wc -c /tmp/v_dash.html")
print(f"   file size: {out}")

rc, out = run(c, "head -5 /tmp/v_dash.html")
print(f"   head: {out}")

rc, out = run(c, "grep -c 'badge-' /tmp/v_dash.html")
print(f"   badges: {out}")

rc, out = run(c, "grep -oP 'font-weight:500\">[^<]+' /tmp/v_dash.html")
print(f"   hostnames: {out}")

rc, out = run(c, "grep 'lumina_white' /tmp/v_dash.html")
print(f"   logo: {out.strip()[:80]}")

rc, out = run(c, "grep -c 'Blossom Lumina' /tmp/v_dash.html")
print(f"   'Blossom Lumina': {out}")

rc, out = run(c, "grep -oP 'height:[0-9]+px' /tmp/v_dash.html")
print(f"   heights: {out}")

rc, out = run(c, "grep -oP 'num total\">[0-9]+' /tmp/v_dash.html")
print(f"   total: {out}")

c.close()
