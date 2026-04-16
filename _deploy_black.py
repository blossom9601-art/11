#!/usr/bin/env python3
"""Deploy lumina_black.png logo + updated app."""
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
    _, o, _ = c.exec_command(cmd, timeout=30)
    o.channel.recv_exit_status()
    return o.read().decode(errors="replace").strip()

def put_text(c, local, remote):
    sftp = c.open_sftp()
    data = open(local, "r", encoding="utf-8").read().replace("\r\n", "\n")
    with sftp.file(remote, "w") as f:
        f.write(data)
    sftp.close()

def put_bin(c, local, remote):
    sftp = c.open_sftp()
    sftp.put(local, remote)
    sftp.close()

c = ssh("192.168.56.108")

# Upload black logo
logo = os.path.join(PROJECT, "static", "image", "logo", "lumina_black.png")
for d in ["/opt/blossom/lumina/web/static/image/logo",
          "/opt/blossom/lumina/web/app/static/image/logo"]:
    run(c, f"mkdir -p {d}")
    put_bin(c, logo, f"{d}/lumina_black.png")
print("[OK] lumina_black.png uploaded")

# Upload app
put_text(c, os.path.join(PROJECT, "agents", "web", "app_factory.py"),
         "/opt/blossom/lumina/web/app/__init__.py")
run(c, "chcon -t httpd_sys_content_t /opt/blossom/lumina/web/app/__init__.py")
run(c, "chcon -R -t httpd_sys_content_t /opt/blossom/lumina/web/app/static")
run(c, "chcon -R -t httpd_sys_content_t /opt/blossom/lumina/web/static")
print("[OK] app uploaded")

run(c, "systemctl restart lumina-web")
time.sleep(2)
print("lumina-web:", run(c, "systemctl is-active lumina-web"))

# Verify
print("logo HTTP:", run(c, "curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:9601/static/image/logo/lumina_black.png"))
run(c, "curl -sk -c /tmp/bk_c.txt -d 'emp_no=admin&password=admin1234!' https://127.0.0.1:9601/login -o /dev/null")
run(c, "curl -sk -b /tmp/bk_c.txt https://127.0.0.1:9601/ -o /tmp/bk_dash.html")
print("logo refs:", run(c, "grep -c 'lumina_black.png' /tmp/bk_dash.html"))
print("hostnames:", run(c, "grep -oP 'font-weight:600\">[^<]+' /tmp/bk_dash.html"))

c.close()
print("DONE — https://192.168.56.108:9601")
