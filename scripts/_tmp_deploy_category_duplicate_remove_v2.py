import paramiko
from pathlib import Path

ROOT = Path(r"c:\Users\ME\Desktop\blossom")
HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"
VERSION = "20260415_cat_dup_remove2"

files = [(ROOT / "static/js/blossom.js", "/opt/blossom/web/static/js/blossom.js")]

for path in sorted((ROOT / "app" / "templates" / "9.category").rglob("*.html")):
    text = path.read_text(encoding="utf-8")
    if VERSION in text:
        rel = path.relative_to(ROOT).as_posix()
        files.append((path, f"/opt/blossom/web/{rel}"))

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)

sftp = ssh.open_sftp()
for local, remote in files:
    sftp.put(str(local), remote)
    print("PUT", local.relative_to(ROOT).as_posix())
sftp.close()

cmds = [
    "systemctl restart blossom-web",
    "systemctl is-active blossom-web",
    "grep -n 'Category Duplicate Feature Removal' /opt/blossom/web/static/js/blossom.js",
    "grep -n 'removeDuplicateUI' /opt/blossom/web/static/js/blossom.js",
    "grep -Rns 'system-duplicate-btn\\|system-duplicate-modal\\|system-duplicate-confirm' /opt/blossom/web/app/templates/9.category --include='*.html' || true",
    "grep -n '20260415_cat_dup_remove2' /opt/blossom/web/app/templates/9.category/9-2.hardware/9-2-1.server/1.server_list.html",
    "grep -n '20260415_cat_dup_remove2' /opt/blossom/web/app/templates/9.category/9-3.software/9-3-1.os/1.os_list.html",
    "grep -n '20260415_cat_dup_remove2' /opt/blossom/web/app/templates/9.category/9-4.component/9-4-1.cpu/1.cpu_list.html",
    "grep -n '20260415_cat_dup_remove2' /opt/blossom/web/app/templates/9.category/9-5.company/9-5-2.department/1.department_list.html",
    "grep -n '20260415_cat_dup_remove2' /opt/blossom/web/app/templates/9.category/9-6.customer/9-6-1.customer/1.client1_list.html",
    "grep -n '20260415_cat_dup_remove2' /opt/blossom/web/app/templates/9.category/9-7.vendor/9-7-1.manufacturer/1.manufacturer_list.html",
]

for cmd in cmds:
    i, o, e = ssh.exec_command(cmd, timeout=40)
    out = o.read().decode("utf-8", "ignore").strip()
    err = e.read().decode("utf-8", "ignore").strip()
    print("CMD:", cmd)
    print("OUT:", out)
    if err:
        print("ERR:", err)

ssh.close()
