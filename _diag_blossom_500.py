#!/usr/bin/env python3
"""Diagnose Blossom Internal Server Error on ttt3."""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

def run(cmd):
    _, o, e = c.exec_command(cmd, timeout=30)
    rc = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    return rc, out, err

print("=== Gunicorn error log (last 50) ===")
_, out, _ = run("tail -50 /var/log/blossom/web/error.log 2>/dev/null")
print(out or "(empty)")

print("\n=== journalctl blossom-web (last 30) ===")
_, out, _ = run("journalctl -u blossom-web --no-pager -n 30")
print(out)

print("\n=== Manual import test ===")
_, out, err = run("cd /opt/blossom/web && /opt/blossom/web/venv/bin/python -c \"from app import create_app; app=create_app('development'); print('OK'); print(app.url_map)\" 2>&1 | tail -30")
print(out)

print("\n=== curl -sk https://127.0.0.1:443/login (body) ===")
_, out, _ = run("curl -sk https://127.0.0.1:443/login 2>/dev/null | head -20")
print(out)

print("\n=== instance dir ===")
_, out, _ = run("ls -la /opt/blossom/web/instance/")
print(out)

print("\n=== SQLite DB exists? ===")
_, out, _ = run("find /opt/blossom/web -name '*.db' -o -name '*.sqlite' 2>/dev/null")
print(out or "(no db files)")

c.close()
