"""Deploy access-control 접속/감사 assets + API to ttt3 /opt/blossom/web."""
import os
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"
BASE = os.path.dirname(os.path.abspath(__file__))

FILES = [
    (
        "static/js/3.access_control/3-1.access_control/3-1-1.access/1.access_list.js",
        "/opt/blossom/web/static/js/3.access_control/3-1.access_control/3-1-1.access/1.access_list.js",
    ),
    (
        "static/js/3.access_control/3-1.access_control/3-1-5.audit/1.audit_list.js",
        "/opt/blossom/web/static/js/3.access_control/3-1.access_control/3-1-5.audit/1.audit_list.js",
    ),
    (
        "static/css/3.access_control/access_control.css",
        "/opt/blossom/web/static/css/3.access_control/access_control.css",
    ),
    (
        "app/templates/3.access_control/3-1.access_control/3-1-1.access/1.access_list.html",
        "/opt/blossom/web/app/templates/3.access_control/3-1.access_control/3-1-1.access/1.access_list.html",
    ),
    (
        "app/templates/3.access_control/3-1.access_control/3-1-5.audit/1.audit_list.html",
        "/opt/blossom/web/app/templates/3.access_control/3-1.access_control/3-1-5.audit/1.audit_list.html",
    ),
    ("app/routes/api.py", "/opt/blossom/web/app/routes/api.py"),
    (
        "app/services/web_access_control_service.py",
        "/opt/blossom/web/app/services/web_access_control_service.py",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/12.access_control.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/12.access_control.html",
    ),
    (
        "static/js/authentication/11-3.admin/11-3-3.setting/12.access_control.js",
        "/opt/blossom/web/static/js/authentication/11-3.admin/11-3-3.setting/12.access_control.js",
    ),
    (
        "static/css/authentication/11-3.admin/11-3-3.setting/12.access_control.css",
        "/opt/blossom/web/static/css/authentication/11-3.admin/11-3-3.setting/12.access_control.css",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/2.mail.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/2.mail.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/4.quality_type.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/4.quality_type.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/5.change_log.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/5.change_log.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/6.info_message.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/6.info_message.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/8.sessions.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/8.sessions.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/9.page_tab.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/9.page_tab.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-3.setting/12.chat_management.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/12.chat_management.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-1.user/1.user_list.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-1.user/1.user_list.html",
    ),
    (
        "app/templates/authentication/11-3.admin/11-3-2.role/1.role_list.html",
        "/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-2.role/1.role_list.html",
    ),
    (
        "docs/web-access-control-roadmap.md",
        "/opt/blossom/web/docs/web-access-control-roadmap.md",
    ),
]


def main() -> None:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    _, _, _ = ssh.exec_command("mkdir -p /opt/blossom/web/docs")
    sftp = ssh.open_sftp()
    for loc, rem in FILES:
        lp = os.path.join(BASE, *loc.split("/"))
        if not os.path.isfile(lp):
            print("SKIP missing:", lp)
            continue
        sftp.put(lp, rem)
        print("OK", loc)
    sftp.close()
    _, out, err = ssh.exec_command(
        "systemctl restart lumina-web; sleep 2; systemctl is-active lumina-web"
    )
    print("lumina-web:", out.read().decode().strip(), err.read().decode().strip())
    _, out, _ = ssh.exec_command(
        "grep -E '20260507roadmap1|browse-policy' /opt/blossom/web/app/templates/3.access_control/3-1.access_control/3-1-1.access/1.access_list.html /opt/blossom/web/static/js/3.access_control/3-1.access_control/3-1-1.access/1.access_list.js 2>/dev/null | head -4; "
        "grep -E '20260507ac3|policy-web-open-mode' /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/12.access_control.html 2>/dev/null | head -4; "
        "grep -c api_access_control_browse_policy /opt/blossom/web/app/routes/api.py 2>/dev/null || true"
    )
    print("verify remote markers:", out.read().decode().strip())
    ssh.close()
    print("DONE")


if __name__ == "__main__":
    main()
