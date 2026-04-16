#!/usr/bin/env python3
"""
Blossom + Lumina 듀얼 서비스 배포 스크립트
==========================================
ttt3 (192.168.56.108) 에 두 서비스를 함께 배포:
  - Port 443  → Blossom (IT 자산관리 대시보드)  Gunicorn :8001
  - Port 9601 → Lumina  (에이전트 승인 관리)    Gunicorn :8000

실행: .\.venv\Scripts\python.exe _deploy_dual.py
"""

import os, sys, tarfile, io, time, textwrap

# ── paramiko ─────────────────────────────────────
try:
    import paramiko
except ImportError:
    print("paramiko 필요: pip install paramiko")
    sys.exit(1)

# ── 서버 정보 ────────────────────────────────────
HOST = "192.168.56.108"   # ttt3 (WEB)
USER = "root"
PASS = "123456"

BLOSSOM_DIR = "/opt/blossom/web"
LUMINA_DIR  = "/opt/blossom/lumina/web"

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# ═════════════════════════════════════════════════
# 1. SSH / SFTP 헬퍼
# ═════════════════════════════════════════════════
def ssh_connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=10)
    return c

def run(ssh, cmd, check=True):
    print(f"  $ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=300)
    rc = stdout.channel.recv_exit_status()
    out = stdout.read().decode(errors="replace").strip()
    err = stderr.read().decode(errors="replace").strip()
    if out:
        for line in out.splitlines()[:20]:
            print(f"    {line}")
    if err and rc != 0:
        for line in err.splitlines()[:10]:
            print(f"    [err] {line}")
    if check and rc != 0:
        raise RuntimeError(f"Command failed (rc={rc}): {cmd}")
    return out


# ═════════════════════════════════════════════════
# 2. Blossom 코드 패키징 (tar.gz)
# ═════════════════════════════════════════════════
def create_tarball():
    """프로젝트에서 필요한 파일만 tar.gz 로 묶는다."""
    tar_path = os.path.join(PROJECT_ROOT, "_blossom_deploy.tar.gz")
    print(f"\n[1/7] 타르볼 생성: {tar_path}")

    EXCLUDE_DIRS = {
        "__pycache__", ".git", ".venv", "node_modules", "tests",
        "instance", "migrations", "agents", "deploy", "docs",
        "sbom", "cp", ".github",
    }
    EXCLUDE_EXTS = {".pyc", ".pyo", ".db", ".sqlite", ".log"}

    # 최상위에서 제외할 파일 패턴
    EXCLUDE_ROOT_PREFIXES = ("_", ".")

    def should_include(arcname):
        parts = arcname.replace("\\", "/").split("/")
        for p in parts:
            if p in EXCLUDE_DIRS:
                return False
        _, ext = os.path.splitext(arcname)
        if ext.lower() in EXCLUDE_EXTS:
            return False
        return True

    include_dirs = ["app", "static", "scripts"]
    include_files = ["config.py", "run.py", "requirements.txt", "index.html"]

    count = 0
    with tarfile.open(tar_path, "w:gz", compresslevel=6) as tar:
        # 디렉터리
        for d in include_dirs:
            full = os.path.join(PROJECT_ROOT, d)
            if not os.path.isdir(full):
                print(f"  [skip] {d}/ 없음")
                continue
            for root, dirs, files in os.walk(full):
                # prune excluded dirs
                dirs[:] = [x for x in dirs if x not in EXCLUDE_DIRS]
                for f in files:
                    fpath = os.path.join(root, f)
                    arcname = os.path.relpath(fpath, PROJECT_ROOT).replace("\\", "/")
                    if should_include(arcname):
                        tar.add(fpath, arcname=arcname)
                        count += 1

        # 개별 파일
        for f in include_files:
            fpath = os.path.join(PROJECT_ROOT, f)
            if os.path.isfile(fpath):
                tar.add(fpath, arcname=f)
                count += 1

    size_mb = os.path.getsize(tar_path) / 1024 / 1024
    print(f"  → {count} 파일, {size_mb:.1f} MB")
    return tar_path


# ═════════════════════════════════════════════════
# 3. 서버 Python 환경 준비
# ═════════════════════════════════════════════════
def setup_python(ssh):
    print("\n[2/7] Python 환경 확인/설치")

    # python3.9 확인
    out = run(ssh, "python3.9 --version 2>/dev/null || echo MISSING", check=False)
    if "MISSING" in out:
        print("  → python39 설치 중...")
        run(ssh, "dnf install -y python39 python39-pip python39-devel", check=False)
        run(ssh, "python3.9 --version")
    else:
        print(f"  → {out}")

    # venv 생성
    run(ssh, f"python3.9 -m venv {BLOSSOM_DIR}/venv --clear 2>/dev/null || python3.9 -m venv {BLOSSOM_DIR}/venv", check=False)

    # pip 업그레이드 & 의존성 설치
    pip = f"{BLOSSOM_DIR}/venv/bin/pip"
    run(ssh, f"{pip} install --upgrade pip setuptools wheel 2>&1 | tail -3")

    # 필수 패키지 (requirements.txt 기반, 테스트 제외)
    deps = [
        "Flask==2.3.3",
        "Werkzeug==2.3.8",
        "Jinja2==3.1.6",
        "MarkupSafe==2.1.3",
        "itsdangerous==2.1.2",
        "click==8.1.7",
        "blinker==1.6.3",
        "Flask-SQLAlchemy==3.0.5",
        "Flask-Login==0.6.3",
        "Flask-Migrate==4.0.5",
        "requests>=2.28,<3",
        "PyMySQL==1.1.1",
        "gunicorn==21.2.0",
    ]
    dep_str = " ".join(f'"{d}"' for d in deps)
    run(ssh, f"{pip} install {dep_str} 2>&1 | tail -5")
    print("  → 의존성 설치 완료")


# ═════════════════════════════════════════════════
# 4. 코드 업로드 및 배포
# ═════════════════════════════════════════════════
def upload_and_extract(ssh, tar_path):
    print("\n[3/7] 코드 업로드 및 배포")

    remote_tar = "/tmp/blossom_deploy.tar.gz"

    # 디렉터리 준비
    run(ssh, f"mkdir -p {BLOSSOM_DIR} {BLOSSOM_DIR}/instance {BLOSSOM_DIR}/uploads")
    run(ssh, "mkdir -p /var/log/blossom/web")

    # 업로드
    print(f"  → 업로드 중... ", end="", flush=True)
    sftp = ssh.open_sftp()
    sftp.put(tar_path, remote_tar)
    sftp.close()
    print("완료")

    # 기존 코드 정리 (venv, instance 보존)
    run(ssh, f"find {BLOSSOM_DIR} -maxdepth 1 -not -name venv -not -name instance -not -name uploads -not -name '.' | "
             f"grep -v '^{BLOSSOM_DIR}$' | xargs rm -rf 2>/dev/null || true", check=False)

    # tar 확인/설치 및 압축 해제
    run(ssh, "which tar >/dev/null 2>&1 || dnf install -y tar gzip", check=False)
    run(ssh, f"/usr/bin/tar xzf {remote_tar} -C {BLOSSOM_DIR}")
    run(ssh, f"rm -f {remote_tar}")

    # 디렉터리 구조 확인
    out = run(ssh, f"ls -la {BLOSSOM_DIR}/")
    print(f"  → 배포 완료: {BLOSSOM_DIR}/")


# ═════════════════════════════════════════════════
# 5. WSGI / Gunicorn 설정 생성
# ═════════════════════════════════════════════════
def create_wsgi_and_gunicorn(ssh):
    print("\n[4/7] WSGI & Gunicorn 설정 생성")

    # wsgi.py
    wsgi_content = textwrap.dedent(f"""\
        import sys, os
        sys.path.insert(0, '{BLOSSOM_DIR}')
        os.chdir('{BLOSSOM_DIR}')
        os.environ.setdefault('FLASK_ENV', 'development')
        from app import create_app
        application = create_app('development')
    """)
    run(ssh, f"cat > {BLOSSOM_DIR}/wsgi.py << 'WSGIEOF'\n{wsgi_content}WSGIEOF")

    # gunicorn config
    gunicorn_content = textwrap.dedent(f"""\
        bind = '127.0.0.1:8001'
        workers = 3
        worker_class = 'gthread'
        threads = 2
        timeout = 120
        graceful_timeout = 30
        keepalive = 5
        max_requests = 1000
        max_requests_jitter = 50
        accesslog = '/var/log/blossom/web/access.log'
        errorlog = '/var/log/blossom/web/error.log'
        loglevel = 'info'
        chdir = '{BLOSSOM_DIR}'
        preload_app = False
    """)
    run(ssh, f"cat > {BLOSSOM_DIR}/gunicorn_blossom.conf.py << 'GCEOF'\n{gunicorn_content}GCEOF")

    print("  → wsgi.py, gunicorn_blossom.conf.py 생성 완료")


# ═════════════════════════════════════════════════
# 6. systemd 서비스 생성
# ═════════════════════════════════════════════════
def create_systemd_service(ssh):
    print("\n[5/7] systemd 서비스 생성")

    service = textwrap.dedent(f"""\
        [Unit]
        Description=Blossom IT Asset Management (Gunicorn + Flask)
        After=network-online.target
        Wants=network-online.target

        [Service]
        Type=simple
        User=lumina-web
        Group=lumina-web
        WorkingDirectory={BLOSSOM_DIR}
        Environment=PYTHONDONTWRITEBYTECODE=1
        ExecStart={BLOSSOM_DIR}/venv/bin/gunicorn \\
            --config {BLOSSOM_DIR}/gunicorn_blossom.conf.py \\
            wsgi:application
        ExecReload=/bin/kill -HUP $MAINPID
        Restart=on-failure
        RestartSec=5
        TimeoutStartSec=60
        TimeoutStopSec=30
        StandardOutput=journal
        StandardError=journal
        SyslogIdentifier=blossom-web
        # 파일시스템 보호
        ProtectHome=yes
        PrivateTmp=yes
        ReadWritePaths={BLOSSOM_DIR}/instance
        ReadWritePaths={BLOSSOM_DIR}/uploads
        ReadWritePaths=/var/log/blossom/web

        [Install]
        WantedBy=multi-user.target
    """)
    run(ssh, f"cat > /usr/lib/systemd/system/blossom-web.service << 'SVCEOF'\n{service}SVCEOF")

    # 퍼미션 설정
    run(ssh, f"chown -R lumina-web:lumina-web {BLOSSOM_DIR}/instance {BLOSSOM_DIR}/uploads /var/log/blossom/web")
    run(ssh, f"chmod -R 755 {BLOSSOM_DIR}")
    run(ssh, f"chmod -R 775 {BLOSSOM_DIR}/instance {BLOSSOM_DIR}/uploads")

    run(ssh, "systemctl daemon-reload")
    print("  → blossom-web.service 생성 완료")


# ═════════════════════════════════════════════════
# 7. NGINX 설정 (듀얼 포트)
# ═════════════════════════════════════════════════
def configure_nginx(ssh):
    print("\n[6/7] NGINX 듀얼 포트 설정")

    # 기존 lumina.conf 백업 및 제거
    run(ssh, "cp /etc/nginx/conf.d/lumina.conf /etc/nginx/conf.d/lumina.conf.bak 2>/dev/null || true", check=False)

    # 결합 설정 생성
    nginx_conf = textwrap.dedent("""\
        ###############################################################################
        # blossom-lumina.conf — NGINX Dual Service Configuration
        # Port  443 → Blossom (IT Asset Management)    Gunicorn :8001
        # Port 9601 → Lumina  (Agent Management)       Gunicorn :8000
        ###############################################################################

        # ── Rate Limiting ────────────────────────────────────
        limit_req_zone $binary_remote_addr zone=bl_general:10m rate=30r/s;
        limit_req_zone $binary_remote_addr zone=bl_login:10m   rate=5r/m;
        limit_req_zone $binary_remote_addr zone=bl_api:10m     rate=60r/s;
        limit_req_zone $binary_remote_addr zone=lm_general:10m rate=30r/s;

        # ── Upstreams ────────────────────────────────────────
        upstream blossom_app {
            server 127.0.0.1:8001;
        }
        upstream lumina_app {
            server 127.0.0.1:8000;
        }

        # ── HTTP → HTTPS redirect ────────────────────────────
        server {
            listen       80 default_server;
            listen       [::]:80 default_server;
            server_name  _;

            location /health {
                proxy_pass http://blossom_app;
                proxy_set_header Host $host;
                allow 127.0.0.1;
                allow ::1;
                deny all;
            }

            location / {
                return 301 https://$host$request_uri;
            }
        }

        # ═════════════════════════════════════════════════════
        # Blossom — Port 443
        # ═════════════════════════════════════════════════════
        server {
            listen       443 ssl http2;
            listen       [::]:443 ssl http2;
            server_name  _;

            # ── TLS ──────────────────────────────────────────
            ssl_certificate      /etc/blossom/lumina/tls/server.crt;
            ssl_certificate_key  /etc/blossom/lumina/tls/server.key;
            ssl_trusted_certificate /etc/blossom/lumina/tls/ca.crt;
            ssl_protocols TLSv1.2 TLSv1.3;
            ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
            ssl_prefer_server_ciphers on;
            ssl_session_cache shared:BL_SSL:10m;
            ssl_session_timeout 1d;
            ssl_session_tickets off;

            # ── Security Headers ─────────────────────────────
            add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
            server_tokens off;
            client_max_body_size 16m;
            client_body_timeout  30s;
            client_header_timeout 30s;
            keepalive_timeout 65s;
            autoindex off;

            # ── Logs ─────────────────────────────────────────
            access_log /var/log/blossom/web/blossom_access.log combined;
            error_log  /var/log/blossom/web/blossom_error.log warn;

            # ── Static Files ─────────────────────────────────
            location /static/ {
                alias /opt/blossom/web/static/;
                expires 7d;
                add_header Cache-Control "public, immutable";
                add_header X-Content-Type-Options "nosniff" always;
                access_log off;
            }

            # ── Login rate limit ─────────────────────────────
            location /api/auth/login {
                limit_req zone=bl_login burst=3 nodelay;
                limit_req_status 429;
                proxy_pass http://blossom_app;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
            }

            # ── API ──────────────────────────────────────────
            location /api/ {
                limit_req zone=bl_api burst=20 nodelay;
                limit_req_status 429;
                proxy_pass http://blossom_app;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
                proxy_read_timeout 60s;
            }

            # ── SSE (Server-Sent Events) ─────────────────────
            location /sse/ {
                proxy_pass http://blossom_app;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
                proxy_buffering off;
                proxy_cache off;
                proxy_read_timeout 86400s;
                proxy_http_version 1.1;
                proxy_set_header Connection '';
            }

            # ── Default ─────────────────────────────────────
            location / {
                limit_req zone=bl_general burst=20 nodelay;
                proxy_pass http://blossom_app;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
            }

            # ── Block dot-files ──────────────────────────────
            location ~ /\\. { deny all; access_log off; log_not_found off; }
            location = /favicon.ico { access_log off; log_not_found off; }
        }

        # ═════════════════════════════════════════════════════
        # Lumina — Port 9601
        # ═════════════════════════════════════════════════════
        server {
            listen       9601 ssl http2;
            listen       [::]:9601 ssl http2;
            server_name  _;

            # ── TLS (same certs) ─────────────────────────────
            ssl_certificate      /etc/blossom/lumina/tls/server.crt;
            ssl_certificate_key  /etc/blossom/lumina/tls/server.key;
            ssl_trusted_certificate /etc/blossom/lumina/tls/ca.crt;
            ssl_protocols TLSv1.2 TLSv1.3;
            ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
            ssl_prefer_server_ciphers on;
            ssl_session_cache shared:LM_SSL:10m;
            ssl_session_timeout 1d;
            ssl_session_tickets off;

            # ── Security Headers ─────────────────────────────
            add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
            server_tokens off;
            client_max_body_size 10m;
            autoindex off;

            # ── Logs ─────────────────────────────────────────
            access_log /var/log/blossom/lumina/web/access.log combined;
            error_log  /var/log/blossom/lumina/web/error.log warn;

            # ── Static Files ─────────────────────────────────
            location /static/ {
                alias /opt/blossom/lumina/web/app/static/;
                expires 7d;
                add_header Cache-Control "public, immutable";
                add_header X-Content-Type-Options "nosniff" always;
                access_log off;
            }

            # ── Default Proxy ────────────────────────────────
            location / {
                limit_req zone=lm_general burst=20 nodelay;
                proxy_pass http://lumina_app;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
            }

            location ~ /\\. { deny all; access_log off; log_not_found off; }
        }
    """)

    # 파일 업로드
    sftp = ssh.open_sftp()
    conf_bytes = nginx_conf.encode("utf-8")
    with sftp.file("/etc/nginx/conf.d/blossom-lumina.conf", "w") as f:
        f.write(nginx_conf)
    sftp.close()

    # 기존 lumina.conf 제거 (충돌 방지)
    run(ssh, "rm -f /etc/nginx/conf.d/lumina.conf", check=False)

    # NGINX 설정 검증
    run(ssh, "nginx -t 2>&1")

    # SELinux: port 443 기본 허용, 9601은 이미 추가됨
    run(ssh, "semanage port -l | grep -E '(443|9601)' | head -5", check=False)

    # NGINX 재시작
    run(ssh, "systemctl restart nginx")
    print("  → NGINX 듀얼 포트 설정 완료 (443 + 9601)")


# ═════════════════════════════════════════════════
# 8. 방화벽 + SELinux
# ═════════════════════════════════════════════════
def configure_firewall_selinux(ssh):
    print("\n  방화벽/SELinux 확인")
    # port 443 기본 열려있을 수 있지만 확인
    run(ssh, "firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true", check=False)
    run(ssh, "firewall-cmd --permanent --add-port=9601/tcp 2>/dev/null || true", check=False)
    run(ssh, "firewall-cmd --reload 2>/dev/null || true", check=False)

    # SELinux: Gunicorn 이 8001 포트 바인딩 할 수 있도록
    run(ssh, "semanage port -a -t http_port_t -p tcp 8001 2>/dev/null || "
             "semanage port -m -t http_port_t -p tcp 8001 2>/dev/null || true", check=False)

    # Blossom 디렉터리에 httpd 컨텍스트 부여
    run(ssh, f"chcon -R -t httpd_sys_content_t {BLOSSOM_DIR}/static/ 2>/dev/null || true", check=False)
    run(ssh, f"chcon -R -t httpd_sys_rw_content_t {BLOSSOM_DIR}/instance/ 2>/dev/null || true", check=False)
    run(ssh, f"chcon -R -t httpd_sys_rw_content_t {BLOSSOM_DIR}/uploads/ 2>/dev/null || true", check=False)

    # httpd_can_network_connect 활성화 (NGINX → Gunicorn)
    run(ssh, "setsebool -P httpd_can_network_connect 1 2>/dev/null || true", check=False)


# ═════════════════════════════════════════════════
# 9. 서비스 시작 & 검증
# ═════════════════════════════════════════════════
def start_and_verify(ssh):
    print("\n[7/7] 서비스 시작 및 검증")

    # blossom-web 서비스 시작
    run(ssh, "systemctl enable blossom-web --now 2>&1 || true", check=False)
    time.sleep(3)

    # lumina-web 서비스 확인/재시작
    run(ssh, "systemctl restart lumina-web 2>&1 || true", check=False)
    time.sleep(2)

    # 서비스 상태 확인
    print("\n  ── 서비스 상태 ───")
    blossom_status = run(ssh, "systemctl is-active blossom-web 2>/dev/null || echo FAILED", check=False)
    lumina_status  = run(ssh, "systemctl is-active lumina-web 2>/dev/null || echo FAILED", check=False)
    nginx_status   = run(ssh, "systemctl is-active nginx 2>/dev/null || echo FAILED", check=False)

    print(f"\n  blossom-web : {blossom_status}")
    print(f"  lumina-web  : {lumina_status}")
    print(f"  nginx       : {nginx_status}")

    # 포트 바인딩 확인
    print("\n  ── 포트 확인 ───")
    run(ssh, "ss -tlnp | grep -E ':(443|9601|8000|8001)\\b' || echo 'No ports found'", check=False)

    # HTTP 접속 테스트
    print("\n  ── HTTP 검증 ───")

    # Blossom (443)
    bl_code = run(ssh, "curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:443/ 2>/dev/null || echo 000", check=False)
    print(f"  Blossom  (443)  : HTTP {bl_code}")

    # Lumina (9601)
    lm_code = run(ssh, "curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:9601/ 2>/dev/null || echo 000", check=False)
    print(f"  Lumina   (9601) : HTTP {lm_code}")

    # 에러 로그 (최근)
    if blossom_status != "active":
        print("\n  ── blossom-web 로그 ───")
        run(ssh, "journalctl -u blossom-web --no-pager -n 20 2>/dev/null || true", check=False)

    if lumina_status != "active":
        print("\n  ── lumina-web 로그 ───")
        run(ssh, "journalctl -u lumina-web --no-pager -n 20 2>/dev/null || true", check=False)

    # 결과 요약
    print("\n" + "=" * 60)
    ok_bl = "✓" if bl_code in ("200", "302") else "✗"
    ok_lm = "✓" if lm_code in ("200", "302") else "✗"
    print(f"  {ok_bl} Blossom  https://192.168.56.108:443   → HTTP {bl_code}")
    print(f"  {ok_lm} Lumina   https://192.168.56.108:9601  → HTTP {lm_code}")
    print("=" * 60)


# ═════════════════════════════════════════════════
# Main
# ═════════════════════════════════════════════════
def main():
    print("═" * 60)
    print("  Blossom + Lumina 듀얼 서비스 배포")
    print(f"  대상: {HOST} (ttt3)")
    print(f"  Port  443 → Blossom (IT 자산관리)")
    print(f"  Port 9601 → Lumina  (에이전트 관리)")
    print("═" * 60)

    # 1. 타르볼 생성
    tar_path = create_tarball()

    # 2. SSH 연결
    ssh = ssh_connect()
    print(f"\n  SSH 연결: {HOST}")

    try:
        # 3. Python 환경
        setup_python(ssh)

        # 4. 코드 배포
        upload_and_extract(ssh, tar_path)

        # 5. WSGI & Gunicorn
        create_wsgi_and_gunicorn(ssh)

        # 6. systemd 서비스
        create_systemd_service(ssh)

        # 7. 방화벽 / SELinux
        configure_firewall_selinux(ssh)

        # 8. NGINX 설정
        configure_nginx(ssh)

        # 9. 시작 & 검증
        start_and_verify(ssh)

    finally:
        ssh.close()

    # 로컬 타르볼 정리
    try:
        os.remove(tar_path)
    except Exception:
        pass

    print("\n배포 완료!")


if __name__ == "__main__":
    main()
