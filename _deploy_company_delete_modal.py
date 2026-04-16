import posixpath
from pathlib import Path

import paramiko

HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"
REMOTE_ROOT = "/opt/blossom/web"

FILES = [
    (
        Path(r"c:\Users\ME\Desktop\blossom\app\templates\9.category\9-5.company\9-5-1.company\1.company_list.html"),
        "app/templates/9.category/9-5.company/9-5-1.company/1.company_list.html",
    ),
    (
        Path(r"c:\Users\ME\Desktop\blossom\static\js\9.category\9-5.company\9-5-1.company\1.company_list.js"),
        "static/js/9.category/9-5.company/9-5-1.company/1.company_list.js",
    ),
]

CHECKS = [
    (
        "html_modal",
        "/opt/blossom/web/app/templates/9.category/9-5.company/9-5-1.company/1.company_list.html",
        'id="system-delete-modal"',
    ),
    (
        "html_subtitle",
        "/opt/blossom/web/app/templates/9.category/9-5.company/9-5-1.company/1.company_list.html",
        "선택된 0개의 회사를 정말 삭제처리하시겠습니까?",
    ),
    (
        "html_js_version",
        "/opt/blossom/web/app/templates/9.category/9-5.company/9-5-1.company/1.company_list.html",
        "v=20260414_delete_modal1",
    ),
    (
        "js_delete_modal_ref",
        "/opt/blossom/web/static/js/9.category/9-5.company/9-5-1.company/1.company_list.js",
        "const modal = qs('system-delete-modal');",
    ),
    (
        "js_delete_confirm_ref",
        "/opt/blossom/web/static/js/9.category/9-5.company/9-5-1.company/1.company_list.js",
        "qs('system-delete-confirm')?.addEventListener('click', async function(){",
    ),
]


def main() -> int:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=8)
    sftp = ssh.open_sftp()

    try:
        for local_path, remote_rel in FILES:
            remote_path = posixpath.join(REMOTE_ROOT, remote_rel)
            remote_dir = posixpath.dirname(remote_path)
            ssh.exec_command(f"mkdir -p '{remote_dir}'", timeout=8)
            sftp.put(str(local_path), remote_path)
            print(f"uploaded: {remote_rel}")

        ssh.exec_command(
            "chmod 644 "
            "/opt/blossom/web/app/templates/9.category/9-5.company/9-5-1.company/1.company_list.html "
            "/opt/blossom/web/static/js/9.category/9-5.company/9-5-1.company/1.company_list.js",
            timeout=8,
        )

        _, _, stderr = ssh.exec_command("systemctl restart blossom-web", timeout=20)
        restart_err = stderr.read().decode("utf-8", errors="replace").strip()
        print("restart_err:", restart_err or "(none)")

        failed = False
        for name, path, needle in CHECKS:
            cmd = (
                "python3 - <<'PY'\n"
                "from pathlib import Path\n"
                f"text = Path({path!r}).read_text(encoding='utf-8', errors='replace')\n"
                f"print('OK' if {needle!r} in text else 'MISS')\n"
                "PY"
            )
            _, stdout, _ = ssh.exec_command(cmd, timeout=10)
            result = stdout.read().decode("utf-8", errors="replace").strip() or "MISS"
            print(f"check:{name}={result}")
            if result != "OK":
                failed = True

        return 1 if failed else 0
    finally:
        sftp.close()
        ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
