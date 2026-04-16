"""Fix Lumina NGINX proxy_set_header to preserve port 9601 in redirects"""
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# Read current config
_, o, _ = ssh.exec_command("cat /etc/nginx/conf.d/blossom-lumina.conf", timeout=10)
conf = o.read().decode()

# Fix: In the Lumina server block, change proxy_set_header Host $host to $host:$server_port
# Also add X-Forwarded-Port header
old_lumina_location = """    # ── Default Proxy ────────────────────────────────
    location / {
        limit_req zone=lm_general burst=20 nodelay;
        proxy_pass http://lumina_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }"""

new_lumina_location = """    # ── Default Proxy ────────────────────────────────
    location / {
        limit_req zone=lm_general burst=20 nodelay;
        proxy_pass http://lumina_app;
        proxy_set_header Host $host:$server_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port $server_port;
    }"""

if old_lumina_location in conf:
    conf = conf.replace(old_lumina_location, new_lumina_location)
    print("[OK] Lumina location block updated")
else:
    print("[WARN] Could not find exact Lumina location block, trying broader fix")
    # Fallback: replace only within the 9601 server block
    # Find the 9601 block and replace Host $host with Host $host:$server_port
    import re
    # Only replace in the Lumina section (after "Port 9601" comment)
    parts = conf.split("# Lumina — Port 9601")
    if len(parts) == 2:
        lumina_part = parts[1]
        lumina_part = lumina_part.replace(
            "proxy_set_header Host $host;",
            "proxy_set_header Host $host:$server_port;\n        proxy_set_header X-Forwarded-Port $server_port;",
            1  # only first occurrence
        )
        conf = parts[0] + "# Lumina — Port 9601" + lumina_part
        print("[OK] Lumina Host header fixed (fallback)")
    else:
        print("[ERROR] Cannot find Lumina section")
        ssh.close()
        exit(1)

# Write back
sftp = ssh.open_sftp()
with sftp.open("/etc/nginx/conf.d/blossom-lumina.conf", "w") as f:
    f.write(conf)
sftp.close()
print("[OK] Config written")

# Test nginx config
_, o, e = ssh.exec_command("nginx -t 2>&1", timeout=10)
result = o.read().decode() + e.read().decode()
print(result)

if "test is successful" in result:
    _, o, e = ssh.exec_command("systemctl reload nginx", timeout=10)
    print("NGINX reloaded:", o.read().decode(), e.read().decode())
    
    # Test redirect
    import time
    time.sleep(1)
    _, o, e = ssh.exec_command(
        "/opt/blossom/web/venv/bin/python3 -c \""
        "import requests,urllib3; urllib3.disable_warnings(); "
        "r=requests.get('https://127.0.0.1:9601/',verify=False,allow_redirects=False); "
        "print('Status:',r.status_code,'Location:',r.headers.get('Location',''))\"",
        timeout=10
    )
    print("Redirect test:", o.read().decode())
else:
    print("[ERROR] NGINX config test failed!")

ssh.close()
