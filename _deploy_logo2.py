#!/usr/bin/env python3
"""Deploy trimmed logo + updated app."""
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
    return rc, stdout.read().decode(errors="replace").strip()

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

# Upload trimmed logo
logo = os.path.join(PROJECT, "static", "image", "logo", "lumina_white.png")
for d in ["/opt/blossom/lumina/web/static/image/logo",
          "/opt/blossom/lumina/web/app/static/image/logo"]:
    run(c, f"mkdir -p {d}")
    put_bin(c, logo, f"{d}/lumina_white.png")
print("[OK] logo uploaded (trimmed)")

# Upload app
put_text(c, os.path.join(PROJECT, "agents", "web", "app_factory.py"),
         "/opt/blossom/lumina/web/app/__init__.py")
run(c, "chcon -t httpd_sys_content_t /opt/blossom/lumina/web/app/__init__.py")
run(c, "chcon -R -t httpd_sys_content_t /opt/blossom/lumina/web/app/static")
run(c, "chcon -R -t httpd_sys_content_t /opt/blossom/lumina/web/static")
print("[OK] app uploaded")

# Restart
run(c, "systemctl restart lumina-web")
time.sleep(2)
_, out = run(c, "systemctl is-active lumina-web")
print(f"lumina-web: {out}")

# Verify
run(c, "curl -sk -c /tmp/lg_c.txt -d 'emp_no=admin&password=admin1234!' https://127.0.0.1:9601/login -o /dev/null")
run(c, "curl -sk -b /tmp/lg_c.txt https://127.0.0.1:9601/ -o /tmp/lg_dash.html")
_, out = run(c, "grep -oP 'font-weight:500\">[^<]+' /tmp/lg_dash.html")
print(f"hostnames: {out}")

c.close()
print("DONE — https://192.168.56.108:9601")
