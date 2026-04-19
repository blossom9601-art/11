"""Deploy UI/UX tab scroll fixes to 192.168.56.108 via paramiko (no interactive password prompt)."""
import paramiko, os, stat

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"
REMOTE_BASE = "/opt/blossom/web"
LOCAL_BASE = os.path.dirname(os.path.abspath(__file__))

FILES = [
    "static/css/detail-common.css",
    "static/css/detail.css",
    "static/css/propro.css",
    "static/js/blossom.js",
]

# Collect all HTML template files that were version-bumped
TEMPLATE_DIR = "app/templates"

def collect_html_files(base, subdir):
    """Collect all .html files under subdir."""
    result = []
    full = os.path.join(base, subdir)
    for root, dirs, files in os.walk(full):
        for f in files:
            if f.endswith('.html'):
                local = os.path.join(root, f)
                rel = os.path.relpath(local, base).replace("\\", "/")
                result.append(rel)
    return result

def main():
    print(f"=== Deploying to {HOST} ===\n")

    # Connect
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)
    sftp = ssh.open_sftp()
    print("[OK] SSH connected\n")

    # 1. Deploy CSS + JS files
    print("[1/3] Deploying CSS + JS files...")
    for rel in FILES:
        local = os.path.join(LOCAL_BASE, rel.replace("/", os.sep))
        remote = f"{REMOTE_BASE}/{rel}"
        sftp.put(local, remote)
        print(f"  -> {rel}")

    # 2. Deploy HTML templates
    print("\n[2/3] Deploying HTML templates...")
    html_files = collect_html_files(LOCAL_BASE, TEMPLATE_DIR)
    count = 0
    for rel in html_files:
        local = os.path.join(LOCAL_BASE, rel.replace("/", os.sep))
        remote = f"{REMOTE_BASE}/{rel}"
        # Ensure remote directory exists
        remote_dir = os.path.dirname(remote).replace("\\", "/")
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            # Create dirs recursively
            parts = remote_dir.split("/")
            for i in range(1, len(parts) + 1):
                d = "/".join(parts[:i])
                try:
                    sftp.stat(d)
                except FileNotFoundError:
                    sftp.mkdir(d)
        sftp.put(local, remote)
        count += 1
    print(f"  Deployed {count} HTML files")

    # Also deploy root-level SPA files
    for spa in ["_tab03_spa.html", "_tab13_spa.html"]:
        local = os.path.join(LOCAL_BASE, spa)
        if os.path.exists(local):
            remote = f"{REMOTE_BASE}/{spa}"
            sftp.put(local, remote)
            print(f"  -> {spa}")

    # 3. Restart service
    print("\n[3/3] Restarting blossom service...")
    stdin, stdout, stderr = ssh.exec_command(
        "systemctl restart blossom 2>/dev/null && echo 'systemctl OK' || "
        "(supervisorctl restart blossom 2>/dev/null && echo 'supervisor OK' || "
        "echo 'MANUAL RESTART NEEDED')"
    )
    result = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"  Result: {result}")
    if err:
        print(f"  Stderr: {err}")

    sftp.close()
    ssh.close()
    print("\n=== Deploy complete ===")

if __name__ == "__main__":
    main()
