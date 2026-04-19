# -*- coding: utf-8 -*-
"""Deploy file-management feature files and restart blossom-web."""

import os
import posixpath
import paramiko


WEB_HOST = "192.168.56.108"
WEB_USER = "root"
WEB_PASS = "123456"
REMOTE_ROOT = "/opt/blossom/web"

LOCAL_ROOT = os.path.dirname(os.path.abspath(__file__))


FILES = [
    ("app/__init__.py", "app/__init__.py"),
    ("app/routes/api.py", "app/routes/api.py"),
    ("app/routes/auth.py", "app/routes/auth.py"),
    ("app/routes/pages.py", "app/routes/pages.py"),
    ("app/services/file_storage_service.py", "app/services/file_storage_service.py"),
    ("app/templates/layouts/tab15-file-shared.html", "app/templates/layouts/tab15-file-shared.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html", "app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/2.mail.html", "app/templates/authentication/11-3.admin/11-3-3.setting/2.mail.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html", "app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/4.quality_type.html", "app/templates/authentication/11-3.admin/11-3-3.setting/4.quality_type.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/5.change_log.html", "app/templates/authentication/11-3.admin/11-3-3.setting/5.change_log.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/6.info_message.html", "app/templates/authentication/11-3.admin/11-3-3.setting/6.info_message.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html", "app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/8.sessions.html", "app/templates/authentication/11-3.admin/11-3-3.setting/8.sessions.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/9.page_tab.html", "app/templates/authentication/11-3.admin/11-3-3.setting/9.page_tab.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html", "app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html"),
    ("app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html", "app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html"),
    ("static/js/blossom.js", "static/js/blossom.js"),
    ("static/js/authentication/11-3.admin/11-3-3.setting/11.file_management.js", "static/js/authentication/11-3.admin/11-3-3.setting/11.file_management.js"),
    ("static/css/file_management_settings.css", "static/css/file_management_settings.css"),
]


def _ensure_remote_dir(sftp, remote_file_path: str) -> None:
    remote_dir = posixpath.dirname(remote_file_path)
    parts = [p for p in remote_dir.split("/") if p]
    current = "/"
    for part in parts:
        current = posixpath.join(current, part)
        try:
            sftp.stat(current)
        except Exception:
            sftp.mkdir(current)


def deploy_files(ssh: paramiko.SSHClient) -> None:
    sftp = ssh.open_sftp()
    try:
        for local_rel, remote_rel in FILES:
            local_abs = os.path.join(LOCAL_ROOT, local_rel)
            remote_abs = posixpath.join(REMOTE_ROOT, remote_rel)
            if not os.path.isfile(local_abs):
                raise FileNotFoundError(f"missing local file: {local_rel}")
            _ensure_remote_dir(sftp, remote_abs)
            print(f"PUT {local_rel}")
            sftp.put(local_abs, remote_abs)
    finally:
        sftp.close()


def run_cmd(ssh: paramiko.SSHClient, cmd: str) -> tuple[str, str, int]:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    rc = stdout.channel.recv_exit_status()
    return out, err, rc


def main() -> int:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(WEB_HOST, username=WEB_USER, password=WEB_PASS)
    try:
        deploy_files(ssh)
        print("[1/3] file upload done")

        out, err, rc = run_cmd(ssh, "systemctl restart blossom-web ; systemctl is-active blossom-web")
        print("[2/3] service status:", out or "(no output)")
        if err:
            print("service stderr:", err)
        if rc != 0:
            return rc

        check_cmd = (
            "grep -n 'admin_file_management_settings' /opt/blossom/web/app/routes/auth.py ; "
            "grep -n '파일관리' /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html"
        )
        out, err, rc = run_cmd(ssh, check_cmd)
        print("[3/3] deploy verify")
        if out:
            print(out)
        if err:
            print(err)
        return rc
    finally:
        ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
