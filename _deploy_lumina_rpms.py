#!/usr/bin/env python3
"""Blossom Lumina — RPM 빌드 + 4대 서버 배포 스크립트.

5개 데몬 패키지:
  lumina-common   (공통 라이브러리)    → 전 서버
  lumina-db       (MariaDB 래퍼)      → ttt1
  lumina-ap       (데이터 수신 서버)   → ttt2
  lumina-web      (대시보드)          → ttt3
  lumina-agent    (자산 수집 에이전트) → ttt4

RPM 빌드는 ttt2에서 수행.
"""

import os
import sys
import time
import textwrap
import traceback

# Windows cp949 콘솔 → UTF-8 출력
if sys.stdout.encoding and sys.stdout.encoding.lower().replace("-", "") != "utf8":
    sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)
    sys.stderr = open(sys.stderr.fileno(), mode="w", encoding="utf-8", errors="replace", buffering=1)

import paramiko

# ── 서버 정보 ────────────────────────────────────────────
SERVERS = {
    "ttt1": {"ip": "192.168.56.107", "role": "DB",    "user": "root", "pw": "123456"},
    "ttt2": {"ip": "192.168.56.106", "role": "AP",    "user": "root", "pw": "123456"},
    "ttt3": {"ip": "192.168.56.108", "role": "WEB",   "user": "root", "pw": "123456"},
    "ttt4": {"ip": "192.168.56.109", "role": "Agent", "user": "root", "pw": "123456"},
}

PROJECT = os.path.dirname(os.path.abspath(__file__))
AGENTS_DIR = os.path.join(PROJECT, "agents")
DEPLOY_DIR = os.path.join(PROJECT, "deploy")

BUILD_HOST = "ttt2"
BUILD_ROOT = "/tmp/lumina-rpmbuild"

DB_AP_PW = "Lumina_AP_2026!"
DB_WEB_PW = "Lumina_WEB_2026!"
AP_AUTH_TOKEN = "lumina-test-token-2026-changeme"


# ═════════════════════════════════════════════════════════
# SSH 헬퍼
# ═════════════════════════════════════════════════════════
def ssh(hostname):
    info = SERVERS[hostname]
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(info["ip"], username=info["user"], password=info["pw"], timeout=10)
    return c

def run(c, cmd, label="", check=True):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=300)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        for line in out.splitlines():
            print(f"  [{label}] {line}")
    if err and rc != 0:
        for line in err.splitlines():
            print(f"  [{label}] ERR: {line}")
    if check and rc != 0:
        print(f"  [{label}] WARNING: exit code {rc}")
    return out, err, rc

def put_str(c, content, path, mode=0o644):
    sftp = c.open_sftp()
    with sftp.file(path, "w") as f:
        f.write(content)
    sftp.chmod(path, mode)
    sftp.close()

def put_file(c, local, remote):
    sftp = c.open_sftp()
    sftp.put(local, remote)
    sftp.close()

def put_dir(c, local_dir, remote_dir):
    sftp = c.open_sftp()
    _put_dir_r(sftp, local_dir, remote_dir)
    sftp.close()

def _put_dir_r(sftp, local, remote):
    try:
        sftp.stat(remote)
    except FileNotFoundError:
        sftp.mkdir(remote)
    for item in os.listdir(local):
        lp = os.path.join(local, item)
        rp = remote + "/" + item
        if item.startswith(("__pycache__", ".")):
            continue
        if os.path.isdir(lp):
            if item in ("dist", "build", "rpmbuild", "installer", "RPMS"):
                continue
            _put_dir_r(sftp, lp, rp)
        else:
            sftp.put(lp, rp)

def get_str(c, path):
    sftp = c.open_sftp()
    with sftp.file(path, "r") as f:
        data = f.read().decode("utf-8", errors="replace")
    sftp.close()
    return data

def get_file(c, remote, local):
    sftp = c.open_sftp()
    sftp.get(remote, local)
    sftp.close()


# ═════════════════════════════════════════════════════════
# Phase 1: ttt2에 소스 업로드 + RPM 빌드
# ═════════════════════════════════════════════════════════
def phase1_build_rpms():
    print("=" * 60)
    print(" Phase 1: ttt2에서 RPM 빌드")
    print("=" * 60)

    c = ssh(BUILD_HOST)

    # rpmbuild 설치
    run(c, "dnf install -y rpm-build 2>&1 | tail -3", BUILD_HOST, check=False)

    # 빌드 디렉토리 구조 생성
    run(c, f"""
rm -rf {BUILD_ROOT}
mkdir -p {BUILD_ROOT}/{{SPECS,SOURCES,BUILD,RPMS,SRPMS}}
mkdir -p {BUILD_ROOT}/SOURCES/{{common,linux/collectors,conf,sql,systemd,nginx,ap,web/app,bin,cli/lumina_cli/commands}}
""", BUILD_HOST)

    # ── 소스 파일 업로드 ─────────────────────────────────
    print(f"\n  소스 파일 업로드 중...")

    # common/ 모듈
    common_dir = os.path.join(AGENTS_DIR, "common")
    for f in ["__init__.py", "config.py", "collector.py", "crypto.py", "masking.py", "cli.py"]:
        fp = os.path.join(common_dir, f)
        if os.path.exists(fp):
            put_file(c, fp, f"{BUILD_ROOT}/SOURCES/common/{f}")
    print(f"  [{BUILD_HOST}] common/ 업로드 완료")

    # linux/agent + collectors
    linux_dir = os.path.join(AGENTS_DIR, "linux")
    for f in ["agent.py"]:
        fp = os.path.join(linux_dir, f)
        if os.path.exists(fp):
            put_file(c, fp, f"{BUILD_ROOT}/SOURCES/linux/{f}")
    # __init__.py for linux package
    put_str(c, "", f"{BUILD_ROOT}/SOURCES/linux/__init__.py")

    coll_dir = os.path.join(linux_dir, "collectors")
    for f in ["__init__.py", "interface.py", "account.py", "package.py"]:
        fp = os.path.join(coll_dir, f)
        if os.path.exists(fp):
            put_file(c, fp, f"{BUILD_ROOT}/SOURCES/linux/collectors/{f}")
    print(f"  [{BUILD_HOST}] linux/ 업로드 완료")

    # conf/
    conf_dir = os.path.join(DEPLOY_DIR, "conf")
    for f in os.listdir(conf_dir):
        fp = os.path.join(conf_dir, f)
        if os.path.isfile(fp):
            put_file(c, fp, f"{BUILD_ROOT}/SOURCES/conf/{f}")
    print(f"  [{BUILD_HOST}] conf/ 업로드 완료")

    # sql/
    sql_dir = os.path.join(DEPLOY_DIR, "sql")
    if os.path.isdir(sql_dir):
        for f in os.listdir(sql_dir):
            fp = os.path.join(sql_dir, f)
            if os.path.isfile(fp):
                put_file(c, fp, f"{BUILD_ROOT}/SOURCES/sql/{f}")
    print(f"  [{BUILD_HOST}] sql/ 업로드 완료")

    # systemd/
    svc_dir = os.path.join(DEPLOY_DIR, "systemd")
    for f in os.listdir(svc_dir):
        fp = os.path.join(svc_dir, f)
        if os.path.isfile(fp):
            put_file(c, fp, f"{BUILD_ROOT}/SOURCES/systemd/{f}")
    print(f"  [{BUILD_HOST}] systemd/ 업로드 완료")

    # nginx/
    nginx_dir = os.path.join(DEPLOY_DIR, "nginx")
    if os.path.isdir(nginx_dir):
        for f in os.listdir(nginx_dir):
            fp = os.path.join(nginx_dir, f)
            if os.path.isfile(fp):
                put_file(c, fp, f"{BUILD_ROOT}/SOURCES/nginx/{f}")

    # AP server.py (실제 동작하는 AP 코드 — 현재 ttt2에서 가져오기)
    ap_server_content = get_str(c, "/opt/blossom/lumina/ap/server.py")
    put_str(c, ap_server_content, f"{BUILD_ROOT}/SOURCES/ap/server.py", 0o755)
    print(f"  [{BUILD_HOST}] ap/server.py 업로드 완료")

    # WEB app — __init__.py는 로컬 app_factory.py에서, 나머지는 ttt3에서 가져오기
    c3 = ssh("ttt3")
    web_wsgi = get_str(c3, "/opt/blossom/lumina/web/wsgi.py")
    web_gunicorn = get_str(c3, "/opt/blossom/lumina/web/gunicorn.conf.py")
    c3.close()

    # __init__.py — 로컬 소스 (에이전트 승인 대시보드)
    app_factory_path = os.path.join(PROJECT, "agents", "web", "app_factory.py")
    if os.path.isfile(app_factory_path):
        put_file(c, app_factory_path, f"{BUILD_ROOT}/SOURCES/web/app/__init__.py")
    else:
        put_str(c, web_init, f"{BUILD_ROOT}/SOURCES/web/app/__init__.py")
    put_str(c, web_wsgi, f"{BUILD_ROOT}/SOURCES/web/wsgi.py")
    put_str(c, web_gunicorn, f"{BUILD_ROOT}/SOURCES/web/gunicorn.conf.py")

    # WEB CLI API (로컬 소스에서 업로드)
    cli_api_path = os.path.join(PROJECT, "agents", "web", "cli_api.py")
    if os.path.isfile(cli_api_path):
        put_file(c, cli_api_path, f"{BUILD_ROOT}/SOURCES/web/app/cli_api.py")
    print(f"  [{BUILD_HOST}] web/ 업로드 완료")

    # ── 스텁 생성 (specs에서 참조하는 파일들) ─────────────
    print(f"\n  스텁 파일 생성 중...")

    # AP 모듈 스텁
    ap_stubs = {
        "__init__.py": '"""Blossom Lumina AP."""\n__version__ = "2.0.0"\n',
        "receiver.py": '"""Lumina AP — Receiver (TLS :5100)."""\n',
        "queue.py": '"""Lumina AP — File-based Queue."""\n',
        "parser.py": '"""Lumina AP — JSON Schema Validator."""\n',
        "worker.py": '"""Lumina AP — Data Transformer."""\n',
        "forwarder.py": '"""Lumina AP — DB Forwarder."""\n',
        "wsgi.py": '"""Lumina AP — WSGI Entry Point."""\nfrom server import create_app\napplication = create_app()\n',
        "auth.py": '"""Lumina AP — Authentication."""\n',
        "schema.py": '"""Lumina AP — Schema Definitions."""\n',
    }
    for fname, content in ap_stubs.items():
        put_str(c, content, f"{BUILD_ROOT}/SOURCES/ap/{fname}")

    # bin/ 스크립트
    bin_stubs = {
        "lumina": '#!/bin/bash\nexec python3 /opt/blossom/lumina/common/cli.py "$@"\n',
        "lumina-healthcheck": '#!/bin/bash\necho "Lumina Health Check"\nsystemctl is-active lumina-agent lumina-ap lumina-web lumina-db 2>/dev/null\n',
        "lumina-rotate-token": '#!/bin/bash\necho "Token rotation — not yet implemented"\n',
        "lumina-cert-renew": '#!/bin/bash\necho "Certificate renewal — not yet implemented"\n',
    }
    for fname, content in bin_stubs.items():
        put_str(c, content, f"{BUILD_ROOT}/SOURCES/bin/{fname}", 0o755)

    # CLI 모듈 — 실제 cli.py는 common/에 포함, 하위 호환용 래퍼만 생성
    cli_stubs = {
        "__init__.py": '"""Lumina CLI."""\n',
        "__main__.py": 'import sys, os\nsys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "common"))\nfrom cli import main\nif __name__ == "__main__": main()\n',
        "main.py": 'import sys, os\nsys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "common"))\nfrom cli import main as cli\n',
        "config.py": '"""CLI config — see common/cli.py."""\n',
        "api_client.py": '"""CLI API client — see common/cli.py."""\n',
        "output.py": '"""CLI output — see common/cli.py."""\n',
    }
    for fname, content in cli_stubs.items():
        put_str(c, content, f"{BUILD_ROOT}/SOURCES/cli/lumina_cli/{fname}")

    cli_cmd_stubs = {
        "__init__.py": "",
        "agent.py": '"""CLI agent commands."""\n',
    }
    for fname, content in cli_cmd_stubs.items():
        put_str(c, content, f"{BUILD_ROOT}/SOURCES/cli/lumina_cli/commands/{fname}")

    # Bash completion
    bash_comp = """# lumina bash completion
_lumina_complete() {
    local cur prev cmds
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    cmds="login agents search agent services version"
    case "$prev" in
        lumina) COMPREPLY=( $(compgen -W "$cmds" -- "$cur") ) ;;
        agent)  COMPREPLY=( $(compgen -W "show status health inventory enable disable resend collect" -- "$cur") ) ;;
        search) COMPREPLY=( $(compgen -W "-H --hostname -I --ip" -- "$cur") ) ;;
        login)  COMPREPLY=( $(compgen -W "-s --server -u --user" -- "$cur") ) ;;
    esac
}
complete -F _lumina_complete lumina
"""
    put_str(c, bash_comp, f"{BUILD_ROOT}/SOURCES/cli/lumina-completion.bash")

    print(f"  [{BUILD_HOST}] 스텁 생성 완료")

    # ── SPEC 파일 업로드 ─────────────────────────────────
    spec_dir = os.path.join(DEPLOY_DIR, "rpm")
    for f in os.listdir(spec_dir):
        if f.endswith(".spec"):
            put_file(c, os.path.join(spec_dir, f), f"{BUILD_ROOT}/SPECS/{f}")
    print(f"  [{BUILD_HOST}] SPEC 파일 업로드 완료")

    # ── CRLF → LF 변환 (SOURCES + SPECS) ──────────────────
    run(c, f"""
find {BUILD_ROOT}/SOURCES -type f \\( -name '*.py' -o -name '*.conf' -o -name '*.sql' -o -name '*.service' -o -name '*.bash' -o -name '*.env' -o -name '*.cnf' \\) \
    -exec sed -i 's/\\r$//' {{}} \\;
find {BUILD_ROOT}/SOURCES/bin -type f -exec sed -i 's/\\r$//' {{}} \\;
find {BUILD_ROOT}/SPECS -name '*.spec' -exec sed -i 's/\\r$//' {{}} \\;
echo "CRLF 변환 완료"
""", BUILD_HOST)

    # ── RPM 빌드 (5개 패키지) ────────────────────────────
    specs = [
        ("blossom-lumina-common.spec", "lumina-common"),
        ("blossom-lumina-agent.spec", "lumina-agent"),
        ("blossom-lumina-db-init.spec", "lumina-db"),
        ("blossom-lumina-ap.spec", "lumina-ap"),
        ("blossom-lumina-web.spec", "lumina-web"),
    ]

    for spec_file, pkg_name in specs:
        print(f"\n  === {pkg_name} RPM 빌드 ===")
        out, err, rc = run(c, f"""
rpmbuild --define "_topdir {BUILD_ROOT}" \
         --define "_sourcedir {BUILD_ROOT}/SOURCES" \
         -bb {BUILD_ROOT}/SPECS/{spec_file} 2>&1 | tail -10
""", BUILD_HOST, check=False)
        if rc != 0:
            print(f"  [{BUILD_HOST}] *** {pkg_name} 빌드 실패! ***")

    # 빌드 결과 확인
    print(f"\n  === 빌드 결과 ===")
    run(c, f"find {BUILD_ROOT}/RPMS -name '*.rpm' -exec ls -lh {{}} \\;", BUILD_HOST)

    # 로컬 deploy/rpm/RPMS/ 에도 복사를 위해 경로 저장
    rpm_list_out, _, _ = run(c, f"find {BUILD_ROOT}/RPMS -name '*.rpm' -type f", BUILD_HOST)

    c.close()
    return rpm_list_out.strip().splitlines() if rpm_list_out.strip() else []


# ═════════════════════════════════════════════════════════
# Phase 2: 서버별 RPM 설치 + 서비스 설정
# ═════════════════════════════════════════════════════════
def phase2_deploy(rpm_list):
    print("\n" + "=" * 60)
    print(" Phase 2: 서버별 RPM 배포 + 서비스 설정")
    print("=" * 60)

    # RPM 파일명 → 패키지 매핑
    rpms = {}
    for path in rpm_list:
        fname = os.path.basename(path)
        if "lumina-common" in fname:
            rpms["common"] = path
        elif "lumina-agent" in fname:
            rpms["agent"] = path
        elif "lumina-db" in fname:
            rpms["db"] = path
        elif "lumina-ap" in fname:
            rpms["ap"] = path
        elif "lumina-web" in fname:
            rpms["web"] = path

    print(f"  빌드된 RPM: {list(rpms.keys())}")

    # 서버별 설치 매핑
    install_map = {
        "ttt1": ["common", "db"],
        "ttt2": ["common", "ap"],
        "ttt3": ["common", "web"],
        "ttt4": ["common", "agent"],
    }

    # 빌드 서버에서 RPM을 로컬(Windows)로 다운로드 후 각 서버에 업로드
    import tempfile, shutil
    tmpdir = tempfile.mkdtemp(prefix="lumina_rpms_")
    c_build = ssh(BUILD_HOST)
    local_rpms = {}
    for key, rpath in rpms.items():
        fname = os.path.basename(rpath)
        lpath = os.path.join(tmpdir, fname)
        get_file(c_build, rpath, lpath)
        local_rpms[key] = (lpath, fname)
        print(f"  Downloaded: {fname}")
    c_build.close()

    for hostname, pkgs in install_map.items():
        info = SERVERS[hostname]
        print(f"\n  [{hostname}] {info['ip']} ({info['role']}) — RPM 설치...")

        c = ssh(hostname)

        for pkg in pkgs:
            if pkg not in local_rpms:
                print(f"    [{hostname}] {pkg} RPM 없음 — 건너뜀")
                continue

            lpath, rpm_fname = local_rpms[pkg]
            remote_tmp = f"/tmp/{rpm_fname}"

            # paramiko SFTP로 업로드
            put_file(c, lpath, remote_tmp)

            # RPM 설치
            run(c, f"rpm -Uvh --force --nodeps {remote_tmp} 2>&1", hostname, check=False)
            run(c, f"rm -f {remote_tmp}", hostname)

        c.close()

    shutil.rmtree(tmpdir, ignore_errors=True)


# ═════════════════════════════════════════════════════════
# Phase 3: 서비스 직접 설정 (RPM 실패 대비 + 추가 설정)
# ═════════════════════════════════════════════════════════
def phase3_configure_services():
    """RPM으로 설치된 서비스 파일 + 실제 운영 코드 직접 배포."""
    print("\n" + "=" * 60)
    print(" Phase 3: 서비스 직접 설정")
    print("=" * 60)

    # ── ttt1: lumina-db ──────────────────────────────────
    print("\n  [ttt1] lumina-db 서비스 설정...")
    c1 = ssh("ttt1")

    # lumina-db.service 배치
    svc_path = os.path.join(DEPLOY_DIR, "systemd", "lumina-db.service")
    with open(svc_path, encoding="utf-8") as f:
        svc_content = f.read()
    put_str(c1, svc_content, "/etc/systemd/system/lumina-db.service")

    run(c1, """
systemctl daemon-reload
systemctl enable lumina-db.service 2>/dev/null
# mariadb가 이미 실행 중이면 lumina-db도 시작
if systemctl is-active mariadb --quiet; then
    systemctl start lumina-db
fi
""", "ttt1")
    c1.close()

    # ── ttt2: lumina-ap ──────────────────────────────────
    print("\n  [ttt2] lumina-ap 서비스 설정...")
    c2 = ssh("ttt2")

    # 실제 동작하는 AP 코드(server.py)가 이미 /opt/blossom/lumina/ap/에 있음
    # systemd unit만 업데이트 (server.py 사용, Type=simple)
    AP_SERVICE = """[Unit]
Description=Blossom Lumina AP Server (Agent Data Receiver/Processor)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=root
EnvironmentFile=-/etc/blossom/lumina/secure.env
ExecStart=/usr/bin/python3 /opt/blossom/lumina/ap/server.py --port 5100
Restart=on-failure
RestartSec=10
TimeoutStartSec=30
TimeoutStopSec=30
WorkingDirectory=/opt/blossom/lumina/ap
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lumina-ap

[Install]
WantedBy=multi-user.target
"""
    put_str(c2, AP_SERVICE, "/etc/systemd/system/lumina-ap.service")

    run(c2, """
systemctl daemon-reload
systemctl enable lumina-ap
""", "ttt2")
    c2.close()

    # ── ttt3: lumina-web ─────────────────────────────────
    print("\n  [ttt3] lumina-web 서비스 설정...")
    c3 = ssh("ttt3")

    WEB_SERVICE = """[Unit]
Description=Blossom Lumina WEB Server (Gunicorn + Flask Dashboard)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=root
EnvironmentFile=-/etc/blossom/lumina/secure.env
Environment=FLASK_ENV=production
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/usr/local/bin/gunicorn --config /opt/blossom/lumina/web/gunicorn.conf.py --chdir /opt/blossom/lumina/web wsgi:application
Restart=on-failure
RestartSec=5
TimeoutStartSec=30
TimeoutStopSec=30
WorkingDirectory=/opt/blossom/lumina/web
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lumina-web

[Install]
WantedBy=multi-user.target
"""
    put_str(c3, WEB_SERVICE, "/etc/systemd/system/lumina-web.service")

    run(c3, """
systemctl daemon-reload
systemctl enable lumina-web nginx

# SELinux: NGINX 로그/TLS 컨텍스트
chown -R nginx:nginx /var/log/blossom/lumina/web/ 2>/dev/null || true
chmod 755 /var/log/blossom /var/log/blossom/lumina /var/log/blossom/lumina/web 2>/dev/null || true
chcon -R -t httpd_log_t /var/log/blossom/lumina/web/ 2>/dev/null || true
chcon -t cert_t /etc/blossom/lumina/tls/*.crt /etc/blossom/lumina/tls/*.key 2>/dev/null || true
""", "ttt3")
    c3.close()

    # ── ttt4: lumina-agent ───────────────────────────────
    print("\n  [ttt4] lumina-agent 서비스 설정...")
    c4 = ssh("ttt4")

    AGENT_SERVICE = """[Unit]
Description=Blossom Lumina Agent (Asset Discovery)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=lumina
Group=lumina
ExecStart=/usr/bin/python3 /opt/blossom/lumina/agent/agent.py --conf /etc/blossom/lumina/agent.conf
Restart=on-failure
RestartSec=30
TimeoutStartSec=30
TimeoutStopSec=30
WorkingDirectory=/opt/blossom/lumina/agent
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lumina-agent
ProtectSystem=full
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
"""
    put_str(c4, AGENT_SERVICE, "/etc/systemd/system/lumina-agent.service")

    run(c4, """
systemctl daemon-reload
systemctl enable lumina-agent
""", "ttt4")
    c4.close()


# ═════════════════════════════════════════════════════════
# Phase 4: 전체 서비스 재시작
# ═════════════════════════════════════════════════════════
def phase4_restart_all():
    print("\n" + "=" * 60)
    print(" Phase 4: 전체 서비스 재시작")
    print("=" * 60)

    # ttt1: lumina-db (mariadb 래퍼)
    print("\n  [ttt1] lumina-db 재시작...")
    c1 = ssh("ttt1")
    run(c1, "systemctl restart mariadb && systemctl restart lumina-db", "ttt1")
    time.sleep(2)
    run(c1, "systemctl status lumina-db --no-pager | head -10", "ttt1")
    c1.close()

    # ttt2: lumina-ap
    print("\n  [ttt2] lumina-ap 재시작...")
    c2 = ssh("ttt2")
    run(c2, "systemctl restart lumina-ap", "ttt2")
    time.sleep(3)
    run(c2, "systemctl status lumina-ap --no-pager | head -10", "ttt2")
    c2.close()

    # ttt3: lumina-web + nginx
    print("\n  [ttt3] lumina-web 재시작...")
    c3 = ssh("ttt3")
    run(c3, "systemctl restart lumina-web && systemctl restart nginx", "ttt3")
    time.sleep(3)
    run(c3, "systemctl status lumina-web --no-pager | head -10", "ttt3")
    run(c3, "systemctl status nginx --no-pager | head -5", "ttt3")
    c3.close()

    # ttt4: lumina-agent
    print("\n  [ttt4] lumina-agent 재시작...")
    c4 = ssh("ttt4")
    run(c4, "systemctl restart lumina-agent", "ttt4")
    time.sleep(5)
    run(c4, "systemctl status lumina-agent --no-pager | head -10", "ttt4")
    c4.close()


# ═════════════════════════════════════════════════════════
# Phase 5: E2E 검증
# ═════════════════════════════════════════════════════════
def phase5_verify():
    print("\n" + "=" * 60)
    print(" Phase 5: 전체 검증")
    print("=" * 60)

    # ── 데몬 상태 테이블 ─────────────────────────────────
    print("\n  === 데몬 상태 ===")
    status_checks = [
        ("ttt1", ["lumina-db", "mariadb"]),
        ("ttt2", ["lumina-ap"]),
        ("ttt3", ["lumina-web", "nginx"]),
        ("ttt4", ["lumina-agent"]),
    ]
    for hostname, services in status_checks:
        c = ssh(hostname)
        for svc in services:
            out, _, _ = run(c, f"systemctl is-active {svc} 2>/dev/null", hostname)
        c.close()

    # ── 기능 검증 ────────────────────────────────────────
    print("\n  === AP 헬스체크 ===")
    c2 = ssh("ttt2")
    run(c2, "curl -sk https://127.0.0.1:5100/health 2>&1 || curl -s http://127.0.0.1:5100/health 2>&1", "ttt2")
    c2.close()

    print("\n  === WEB 헬스체크 ===")
    c3 = ssh("ttt3")
    run(c3, "curl -sk https://127.0.0.1/health 2>&1", "ttt3")
    c3.close()

    print("\n  === Agent 로그 (최근 5줄) ===")
    c4 = ssh("ttt4")
    run(c4, "journalctl -u lumina-agent --no-pager -n 5 --since='1 min ago' 2>&1 | tail -5", "ttt4")
    c4.close()

    print("\n  === DB 수집 데이터 ===")
    c1 = ssh("ttt1")
    run(c1, f"""
mysql -u lumina_web_reader -p'{DB_WEB_PW}' -e "
USE lumina;
SELECT id, hostname, os_type, last_seen FROM collected_hosts;
SELECT 'interfaces' AS type, COUNT(*) AS cnt FROM collected_interfaces
UNION ALL
SELECT 'accounts', COUNT(*) FROM collected_accounts
UNION ALL
SELECT 'packages', COUNT(*) FROM collected_packages;
" 2>&1
""", "ttt1")
    c1.close()

    # ── RPM 설치 확인 ────────────────────────────────────
    print("\n  === RPM 설치 확인 ===")
    rpm_checks = {
        "ttt1": ["lumina-common", "lumina-db"],
        "ttt2": ["lumina-common", "lumina-ap"],
        "ttt3": ["lumina-common", "lumina-web"],
        "ttt4": ["lumina-common", "lumina-agent"],
    }
    for hostname, pkg_list in rpm_checks.items():
        c = ssh(hostname)
        for pkg in pkg_list:
            run(c, f"rpm -q {pkg} 2>/dev/null || echo '{pkg}: not installed (direct deploy)'", hostname)
        c.close()

    # ── 최종 요약 ────────────────────────────────────────
    print("\n" + "=" * 60)
    print(" 데몬 관리 명령어 요약")
    print("=" * 60)
    print("""
  ┌─────────────┬──────────────────┬───────────────────────────────────────┐
  │ 데몬        │ 서버             │ 관리 명령                              │
  ├─────────────┼──────────────────┼───────────────────────────────────────┤
  │ lumina-db   │ ttt1 (.107)      │ systemctl {start|stop|status} lumina-db   │
  │ lumina-ap   │ ttt2 (.106)      │ systemctl {start|stop|status} lumina-ap   │
  │ lumina-web  │ ttt3 (.108)      │ systemctl {start|stop|status} lumina-web  │
  │ lumina-agent│ ttt4 (.109)      │ systemctl {start|stop|status} lumina-agent│
  └─────────────┴──────────────────┴───────────────────────────────────────┘

  RPM 패키지:
    lumina-common  — 공통 라이브러리 (전 서버)
    lumina-db      — MariaDB 래퍼 (ttt1)
    lumina-ap      — AP 데이터 수신 서버 (ttt2)
    lumina-web     — WEB 대시보드 (ttt3)
    lumina-agent   — 자산 수집 에이전트 (ttt4)
""")
    print("=" * 60)


# ═════════════════════════════════════════════════════════
# Main
# ═════════════════════════════════════════════════════════
if __name__ == "__main__":
    try:
        rpm_list = phase1_build_rpms()
        phase2_deploy(rpm_list)
        phase3_configure_services()
        phase4_restart_all()
        phase5_verify()
    except Exception as e:
        print(f"\n*** ERROR: {e}")
        traceback.print_exc()
        sys.exit(1)
