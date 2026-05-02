"""Deploy Lumina dashboard (agents/web) and patch nginx for long NTP requests."""
import os
import time

import paramiko

ROOT = os.path.dirname(os.path.abspath(__file__))
HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

NGINX_NTP_BLOCK = """
    location = /settings/ntp/sync {
        limit_req zone=lumina_general burst=10 nodelay;

        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout  15s;
        proxy_read_timeout     180s;
        proxy_send_timeout     180s;
    }

    location = /settings/ntp {
        limit_req zone=lumina_general burst=10 nodelay;

        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout  15s;
        proxy_read_timeout     180s;
        proxy_send_timeout     180s;
    }

"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)


def ssh_out(cmd, timeout=60):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    return stdout.read().decode().strip(), stderr.read().decode().strip()


print("[1/5] Ensuring paramiko in /opt/blossom/web/venv (SSH from Lumina WEB uses this Python)...")
po, pe = ssh_out(
    "/opt/blossom/web/venv/bin/pip install -q 'paramiko>=3.4.0' && "
    "/opt/blossom/web/venv/bin/python -c \"import paramiko; print('paramiko', paramiko.__version__)\"",
    timeout=180,
)
print("  ", (po or pe)[:300])
print("  Done")

print("[2/5] Uploading app_factory.py -> Lumina __init__.py...")
sftp = ssh.open_sftp()
sftp.put(
    os.path.join(ROOT, "agents/web/app_factory.py"),
    "/opt/blossom/lumina/web/app/__init__.py",
)
sftp.close()
print("  Done")

print("[3/5] Removing duplicate conf.d/lumina.conf (keeps lumina-web.conf zones unique)...")
ssh_out(
    "test -f /etc/nginx/conf.d/lumina.conf && "
    "mv -f /etc/nginx/conf.d/lumina.conf /etc/nginx/conf.d/lumina.conf.duplicate-bak || true",
    timeout=10,
)
print("  Done")

print("[4/5] Patching lumina-web.conf with NTP proxy timeouts (if missing)...")
sftp = ssh.open_sftp()
with sftp.open("/etc/nginx/conf.d/lumina-web.conf", "r") as rf:
    text = rf.read().decode("utf-8", errors="replace")
if "location = /settings/ntp/sync" not in text:
    lines = text.splitlines(keepends=True)
    listen_idx = None
    for i, ln in enumerate(lines):
        if "9601" in ln and "listen" in ln and "ssl" in ln:
            listen_idx = i
            break
    insert_at = None
    if listen_idx is not None:
        for i in range(listen_idx, len(lines)):
            if lines[i].strip() == "location / {":
                insert_at = i
                break
    if insert_at is None:
        print("  [WARN] Could not find insert point; skip nginx patch")
    else:
        text = "".join(lines[:insert_at]) + NGINX_NTP_BLOCK + "".join(lines[insert_at:])
        with sftp.open("/etc/nginx/conf.d/lumina-web.conf", "w") as wf:
            wf.write(text.encode("utf-8"))
        print("  Inserted NTP location blocks")
else:
    print("  NTP blocks already present; skip")
sftp.close()

out, err = ssh_out("nginx -t 2>&1", timeout=20)
print("  nginx -t:", out or err)
if "successful" not in (out + err).lower():
    print("  [ERROR] nginx -t failed")
else:
    ssh_out("systemctl restart nginx", timeout=30)
    print("  nginx restarted")

print("[5/5] Clearing pycache & restarting lumina-web...")
ssh.exec_command(
    "rm -rf /opt/blossom/lumina/web/app/__pycache__ /opt/blossom/lumina/web/__pycache__",
    timeout=5,
)[1].read()
ssh.exec_command("systemctl restart lumina-web", timeout=20)[1].read()
time.sleep(4)

sto, _ = ssh_out("systemctl is-active lumina-web nginx", timeout=10)
print(f"  lumina-web + nginx: {sto}")

for label, url in [
    ("Lumina /health:8000", "curl -sk -m 5 http://127.0.0.1:8000/health"),
    ("HTTPS :9601/health", "curl -sk -m 5 https://127.0.0.1:9601/health"),
]:
    o, e = ssh_out(url + "; echo", timeout=10)
    print(f"  {label}:", (o or e)[:200])

_, o, _ = ssh.exec_command("curl -sk https://127.0.0.1:9601/login", timeout=8)
login_html = o.read().decode(errors="replace")
print(f"  Login lang=en: {'lang=\"en\"' in login_html}")
print(f"  No Korean: {all(ord(c) < 0xAC00 or ord(c) > 0xD7A3 for c in login_html)}")

ssh.exec_command(
    "curl -sk -c /tmp/lck.txt -X POST https://127.0.0.1:9601/login "
    '-d "emp_no=admin&password=admin1234!" -o /dev/null',
    timeout=8,
)
time.sleep(1)
_, o, _ = ssh.exec_command(
    "curl -sk -b /tmp/lck.txt https://127.0.0.1:9601/settings", timeout=15
)
settings_html = o.read().decode(errors="replace")
print(
    "  NTP UI:",
    ("NTP Servers" in settings_html and "Force sync now" in settings_html),
)

_, o, _ = ssh.exec_command(
    "curl -sk -b /tmp/lck.txt -X POST https://127.0.0.1:9601/settings/ntp/sync "
    "-o /dev/null -w %{http_code}",
    timeout=90,
)
print("  Force sync POST HTTP:", o.read().decode().strip(), "(expect 302)")

print("\nDone.")
ssh.close()
