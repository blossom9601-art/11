"""로그인 사번 영문·숫자 제한(sign-in.js/html, auth.py)을 192.168.56.108에 반영 후 웹 서비스 재시작."""
import os
import sys

try:
    import paramiko
except ImportError:
    print("paramiko 필요: pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"
REMOTE_BASE = "/opt/blossom/web"
LOCAL_BASE = os.path.dirname(os.path.abspath(__file__))

FILES = [
    "static/js/authentication/11-2.basic/sign-in.js",
    "app/templates/authentication/11-2.basic/sign-in.html",
    "app/routes/auth.py",
]


def main():
    print(f"=== sign-in 사번 제한 배포 → {HOST} ===\n")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)
    sftp = ssh.open_sftp()
    print("[OK] SSH connected\n")

    for rel in FILES:
        local = os.path.join(LOCAL_BASE, rel.replace("/", os.sep))
        remote = f"{REMOTE_BASE}/{rel}"
        remote_dir = os.path.dirname(remote).replace("\\", "/")
        parts = [p for p in remote_dir.split("/") if p]
        for i in range(1, len(parts) + 1):
            d = "/" + "/".join(parts[:i])
            try:
                sftp.stat(d)
            except FileNotFoundError:
                try:
                    sftp.mkdir(d)
                except OSError:
                    pass
        sftp.put(local, remote)
        print(f"  put {rel}")

    print("\n[restart] 웹 서비스 재시작 시도…")
    cmd = (
        "set -e; "
        "for u in blossom lumina-web lumina; do "
        "  systemctl restart \"$u\" 2>/dev/null && echo RESTARTED:$u && break; "
        "done; "
        "systemctl is-active blossom 2>/dev/null || true; "
        "systemctl is-active lumina-web 2>/dev/null || true; "
        "systemctl is-active lumina 2>/dev/null || true"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    print(out or "(no stdout)")
    if err:
        print("stderr:", err)

    sftp.close()
    ssh.close()
    print("\n=== done ===")


if __name__ == "__main__":
    main()
