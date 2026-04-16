#!/usr/bin/env python3
"""Debug blossom-web startup failure."""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

def run(cmd):
    _, o, e = c.exec_command(cmd, timeout=60)
    o.channel.recv_exit_status()
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out: print(out)
    if err: print(f"[stderr] {err}")

print("=== blossom-web journal (last 30 lines) ===")
run("journalctl -u blossom-web --no-pager -n 30")

print("\n=== gunicorn error log ===")
run("cat /var/log/blossom/web/error.log 2>/dev/null | tail -30")

print("\n=== Try manual Gunicorn start ===")
run("cd /opt/blossom/web && /opt/blossom/web/venv/bin/python -c 'from app import create_app; a = create_app(\"development\"); print(\"App created OK\")' 2>&1 | head -50")

print("\n=== Check wsgi.py ===")
run("cat /opt/blossom/web/wsgi.py")

c.close()
