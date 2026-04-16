#!/usr/bin/env python3
"""Deploy work dashboard first-render fix and verify remote response."""
import os
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"
LOCAL_ROOT = r"C:\Users\ME\Desktop\blossom"
REMOTE_ROOT = "/opt/blossom/web"

FILES = [
    (
        os.path.join(LOCAL_ROOT, "static", "js", "9.category", "9-1.business", "9-1-0.work_dashboard", "1.work_dashboard.js"),
        f"{REMOTE_ROOT}/static/js/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.js",
    ),
    (
        os.path.join(LOCAL_ROOT, "app", "templates", "9.category", "9-1.business", "9-1-0.work_dashboard", "1.work_dashboard.html"),
        f"{REMOTE_ROOT}/app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html",
    ),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=10)
sftp = ssh.open_sftp()

for lp, rp in FILES:
    sftp.put(lp, rp)
    print(f"DEPLOYED: {rp}")

# Restart service for template/runtime consistency
stdin, stdout, stderr = ssh.exec_command("systemctl restart blossom-web")
code = stdout.channel.recv_exit_status()
print(f"RESTART: exit={code}")

# Verify template has new query version
stdin, stdout, stderr = ssh.exec_command(
    "grep -n '1.work_dashboard.js?v=' /opt/blossom/web/app/templates/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html"
)
print("TEMPLATE:", stdout.read().decode().strip())

# Verify deployed JS contains new layout-ready guard
stdin, stdout, stderr = ssh.exec_command(
    "grep -n '_waitForLayoutReady' /opt/blossom/web/static/js/9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.js"
)
print("JS_MARKER:", stdout.read().decode().strip())

# Verify served page contains new version string
stdin, stdout, stderr = ssh.exec_command(
    "curl -sk https://127.0.0.1/p/cat_business_dashboard | grep -o '1.work_dashboard.js?v=[^\" ]*' | head -1"
)
print("SERVED:", stdout.read().decode().strip())

sftp.close()
ssh.close()
print("DONE")
