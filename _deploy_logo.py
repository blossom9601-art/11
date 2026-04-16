#!/usr/bin/env python3
"""Deploy big logo, no text."""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
import paramiko

PROJECT = os.path.dirname(os.path.abspath(__file__))

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

def put_text(c, local, remote):
    sftp = c.open_sftp()
    data = open(local, "r", encoding="utf-8").read().replace("\r\n", "\n")
    with sftp.file(remote, "w") as f:
        f.write(data)
    sftp.close()

c = ssh("192.168.56.108")
put_text(c, os.path.join(PROJECT, "agents", "web", "app_factory.py"),
         "/opt/blossom/lumina/web/app/__init__.py")
run(c, "chcon -t httpd_sys_content_t /opt/blossom/lumina/web/app/__init__.py")
run(c, "systemctl restart lumina-web")
time.sleep(2)

rc, out = run(c, "systemctl is-active lumina-web")
print(f"lumina-web: {out}")

run(c, "curl -sk -c /tmp/bl_cookie.txt -d 'emp_no=admin&password=admin1234!' https://127.0.0.1:9601/login -o /dev/null")
run(c, "curl -sk -b /tmp/bl_cookie.txt https://127.0.0.1:9601/ -o /tmp/bl_dash.html")

rc, out = run(c, "grep -c '에이전트 승인 관리' /tmp/bl_dash.html")
print(f"'에이전트 승인 관리': {out}")
rc, out = run(c, "grep -c '에이전트 관리 콘솔' /tmp/bl_dash.html")
print(f"'에이전트 관리 콘솔': {out}")
rc, out = run(c, "grep -oP 'height:[0-9]+px' /tmp/bl_dash.html")
print(f"heights: {out}")
rc, out = run(c, "grep -oP 'font-weight:500\">[^<]+' /tmp/bl_dash.html")
print(f"hostnames: {out}")

c.close()
print("DONE — https://192.168.56.108:9601")
