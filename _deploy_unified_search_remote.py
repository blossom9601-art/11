import posixpath
from pathlib import Path
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"
REMOTE_ROOT = "/opt/blossom/web"

FILES = [
    "app/routes/main.py",
    "app/routes/api.py",
    "app/templates/layouts/_header.html",
    "app/templates/addon_application/5.search.html",
    "static/js/blossom.js",
    "static/js/addon_application/5.search.js",
    "static/css/blossom.css",
]


def ensure_remote_dir(sftp, remote_dir: str) -> None:
    parts = [p for p in remote_dir.split("/") if p]
    current = ""
    for p in parts:
        current = current + "/" + p
        try:
            sftp.stat(current)
        except IOError:
            sftp.mkdir(current)


def upload_files() -> None:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)
    sftp = ssh.open_sftp()

    try:
        for rel in FILES:
            local_path = Path(rel)
            remote_path = posixpath.join(REMOTE_ROOT, rel.replace("\\", "/"))
            ensure_remote_dir(sftp, posixpath.dirname(remote_path))
            sftp.put(str(local_path), remote_path)
            print(f"uploaded: {rel}")

        # Try common service restart commands (best effort)
        restart_cmds = [
            "systemctl restart blossom",
            "systemctl restart blossom-web",
            "supervisorctl restart blossom",
            "supervisorctl restart blossom-web",
            "pkill -f 'python.*run.py' ; cd /opt/blossom/web ; nohup .venv/bin/python run.py >/tmp/blossom.log 2>&1 &",
        ]
        restarted = False
        for cmd in restart_cmds:
            stdin, stdout, stderr = ssh.exec_command(cmd, timeout=20)
            code = stdout.channel.recv_exit_status()
            err = (stderr.read() or b"").decode("utf-8", "ignore").strip()
            if code == 0:
                print(f"restart_ok: {cmd}")
                restarted = True
                break
            else:
                print(f"restart_fail: {cmd} :: {err[:200]}")

        if not restarted:
            print("restart: skipped (all commands failed)")

        # Verify deployed markers
        checks = {
            "api_post": ("app/routes/api.py", "@api_bp.route('/api/search/unified', methods=['GET', 'POST'])"),
            "main_stickers": ("app/routes/main.py", "search_stickers=search_stickers"),
            "url_hide": ("static/js/blossom.js", "bls_unified_search_q"),
            "search_page_sticker": ("app/templates/addon_application/5.search.html", "search-empty-sticker"),
            "search_js_post": ("static/js/addon_application/5.search.js", "fetch(API_URL, {") ,
            "css_domain_badge": ("static/css/blossom.css", ".search-page .search-item-domain {"),
        }

        for name, (rel, needle) in checks.items():
            remote_path = posixpath.join(REMOTE_ROOT, rel)
            txt = sftp.open(remote_path).read().decode("utf-8", "replace")
            print(f"check:{name}={'OK' if needle in txt else 'MISS'}")

    finally:
        sftp.close()
        ssh.close()


if __name__ == "__main__":
    upload_files()
