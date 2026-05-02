"""데이터센터 RACK 관련 정적·템플릿 파일 운영 WEB 반영."""
import posixpath
from pathlib import Path

import paramiko

HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"
REMOTE_ROOT = "/opt/blossom/web"

ROOT = Path(__file__).resolve().parent
FILES = [
    (
        ROOT / "app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.html",
        "app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.html",
    ),
    (
        ROOT / "static/js/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.js",
        "static/js/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.js",
    ),
    (
        ROOT / "app/templates/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.html",
        "app/templates/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.html",
    ),
    (
        ROOT / "static/js/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.js",
        "static/js/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.js",
    ),
    (
        ROOT / "app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/2.rack_detail.html",
        "app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/2.rack_detail.html",
    ),
    (
        ROOT / "static/js/6.datacenter/6-3.rack/6-3-2.rack_list/2.rack_detail.js",
        "static/js/6.datacenter/6-3.rack/6-3-2.rack_list/2.rack_detail.js",
    ),
    (
        ROOT / "static/css/detail6.css",
        "static/css/detail6.css",
    ),
    (
        ROOT / "app/templates/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.html",
        "app/templates/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.html",
    ),
    (
        ROOT / "static/js/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.js",
        "static/js/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.js",
    ),
]

CHECKS = [
    (
        "rack_html_fk_ignore",
        f"{REMOTE_ROOT}/app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.html",
        'data-fk-ignore="1"',
    ),
    (
        "html_vendor_plain_text",
        f"{REMOTE_ROOT}/app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.html",
        'rack-free-text',
    ),
    (
        "js_rack_business_status_store",
        f"{REMOTE_ROOT}/static/js/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.js",
        "rackBusinessStatus:",
    ),
    (
        "rack_detail_status_wrap",
        f"{REMOTE_ROOT}/app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/2.rack_detail.html",
        'rack-detail-status-wrap',
    ),
    (
        "detail6_status_dot_css",
        f"{REMOTE_ROOT}/static/css/detail6.css",
        "rack-detail-status-dot--active",
    ),
    (
        "rack_list_delete_modal",
        f"{REMOTE_ROOT}/app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.html",
        'id="system-delete-modal"',
    ),
    (
        "rack_list_detail6_link",
        f"{REMOTE_ROOT}/app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.html",
        "detail6.css?v=1.4",
    ),
    (
        "thermo_js_dc_asset_status",
        f"{REMOTE_ROOT}/static/js/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.js",
        "dcAssetBusinessStatus",
    ),
    (
        "cctv_js_dc_asset_status",
        f"{REMOTE_ROOT}/static/js/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.js",
        "dcAssetBusinessStatus",
    ),
]


def main() -> int:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    sftp = ssh.open_sftp()
    failed = False

    try:
        for local_path, remote_rel in FILES:
            if not local_path.is_file():
                print(f"missing local: {local_path}")
                failed = True
                continue
            remote_path = posixpath.join(REMOTE_ROOT, remote_rel)
            remote_dir = posixpath.dirname(remote_path)
            ssh.exec_command(f"mkdir -p '{remote_dir}'", timeout=15)
            sftp.put(str(local_path), remote_path)
            print(f"uploaded: {remote_rel}")

        # nginx 정적 캐시가 있으면 비우고 재로드 (있으면)
        _, _, _ = ssh.exec_command(
            "rm -rf /var/cache/nginx/blossom_proxy/* 2>/dev/null; "
            "systemctl reload nginx 2>/dev/null; echo CACHE_OR_NGINX_OK",
            timeout=15,
        )

        for svc in ("blossom-web", "lumina-web"):
            _, _, stderr = ssh.exec_command(f"systemctl restart {svc}", timeout=45)
            err = stderr.read().decode("utf-8", errors="replace").strip()
            _, stdout, _ = ssh.exec_command(f"systemctl is-active {svc}", timeout=10)
            active = stdout.read().decode("utf-8", errors="replace").strip()
            print(f"{svc}: active={active!r} stderr={err or '(none)'}")

        for name, path, needle in CHECKS:
            cmd = (
                "python3 - <<'PY'\n"
                "from pathlib import Path\n"
                f"p = Path({path!r})\n"
                "text = p.read_text(encoding='utf-8', errors='replace') if p.exists() else ''\n"
                f"print('OK' if {needle!r} in text else 'MISS')\n"
                "PY"
            )
            _, stdout, _ = ssh.exec_command(cmd, timeout=15)
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
