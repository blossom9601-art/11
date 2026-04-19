"""Deploy UI/UX tab scroll indicator fixes to production WEB server (192.168.56.108)."""
import subprocess, sys, os

WEB_HOST = "192.168.56.108"
WEB_USER = "root"
WEB_PASS = "123456"
REMOTE_BASE = "/opt/blossom/web"

# Files to deploy (relative paths from project root)
CSS_FILES = [
    "static/css/detail-common.css",
    "static/css/detail.css",
    "static/css/propro.css",
]
JS_FILES = [
    "static/js/blossom.js",
]

# HTML template files that had version bumps
# We'll use rsync/scp for the whole templates directory to be safe
TEMPLATE_DIR = "app/templates"

LOCAL_BASE = os.path.dirname(os.path.abspath(__file__))

def run_ssh(cmd):
    """Run command on remote via sshpass+ssh."""
    full = f'sshpass -p "{WEB_PASS}" ssh -o StrictHostKeyChecking=no {WEB_USER}@{WEB_HOST} "{cmd}"'
    print(f"  SSH: {cmd}")
    r = subprocess.run(full, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ERR: {r.stderr.strip()}")
    return r

def scp_file(local, remote):
    """Copy a single file to remote."""
    full = f'sshpass -p "{WEB_PASS}" scp -o StrictHostKeyChecking=no "{local}" {WEB_USER}@{WEB_HOST}:"{remote}"'
    print(f"  SCP: {os.path.basename(local)} -> {remote}")
    r = subprocess.run(full, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ERR: {r.stderr.strip()}")
    return r

def rsync_dir(local_dir, remote_dir):
    """Rsync a directory to remote."""
    full = f'sshpass -p "{WEB_PASS}" rsync -avz --delete -e "ssh -o StrictHostKeyChecking=no" "{local_dir}/" {WEB_USER}@{WEB_HOST}:"{remote_dir}/"'
    print(f"  RSYNC: {local_dir} -> {remote_dir}")
    r = subprocess.run(full, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ERR: {r.stderr.strip()}")
    else:
        # Count transferred files
        lines = [l for l in r.stdout.split('\n') if l.strip() and not l.startswith('sending') and not l.startswith('sent') and not l.startswith('total')]
        print(f"  Transferred: {len(lines)} items")
    return r

print("=== Blossom UI/UX Deploy: Tab Scroll Indicators ===\n")

# 1. Deploy CSS files
print("[1/4] Deploying CSS files...")
for f in CSS_FILES:
    local = os.path.join(LOCAL_BASE, f)
    remote = f"{REMOTE_BASE}/{f}"
    scp_file(local, remote)

# 2. Deploy JS files
print("\n[2/4] Deploying JS files...")
for f in JS_FILES:
    local = os.path.join(LOCAL_BASE, f)
    remote = f"{REMOTE_BASE}/{f}"
    scp_file(local, remote)

# 3. Deploy HTML templates (rsync to handle the many version-bumped files)
print("\n[3/4] Deploying HTML templates...")
local_tmpl = os.path.join(LOCAL_BASE, TEMPLATE_DIR)
remote_tmpl = f"{REMOTE_BASE}/{TEMPLATE_DIR}"
rsync_dir(local_tmpl, remote_tmpl)

# 4. Restart Flask on remote
print("\n[4/4] Restarting Flask service...")
run_ssh("systemctl restart blossom 2>/dev/null || supervisorctl restart blossom 2>/dev/null || echo 'Manual restart needed'")

print("\n=== Deploy complete ===")
