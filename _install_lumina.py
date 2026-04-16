#!/usr/bin/env python3
"""Blossom Lumina — 4대 서버 자동 설치 스크립트.

ttt1 (192.168.56.107) — DB (MariaDB)
ttt2 (192.168.56.106) — AP (수집 서버)
ttt3 (192.168.56.108) — WEB (대시보드)
ttt4 (192.168.56.109) — Agent (수집 대상)
"""

import os
import sys
import time
import paramiko
import traceback

# ── 서버 정보 ────────────────────────────────────────────
SERVERS = {
    "ttt1": {"ip": "192.168.56.107", "role": "DB",    "user": "root", "pw": "123456"},
    "ttt2": {"ip": "192.168.56.106", "role": "AP",    "user": "root", "pw": "123456"},
    "ttt3": {"ip": "192.168.56.108", "role": "WEB",   "user": "root", "pw": "123456"},
    "ttt4": {"ip": "192.168.56.109", "role": "Agent", "user": "root", "pw": "123456"},
}

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
AGENTS_DIR = os.path.join(PROJECT_ROOT, "agents")
DEPLOY_DIR = os.path.join(PROJECT_ROOT, "deploy")

# DB 계정 비밀번호 (운영 시 반드시 변경)
DB_AP_PW = "Lumina_AP_2026!"
DB_WEB_PW = "Lumina_WEB_2026!"
DB_ADMIN_PW = "Lumina_Admin_2026!"
AP_AUTH_TOKEN = "lumina-test-token-2026-changeme"


def ssh_connect(hostname):
    """SSH 연결."""
    info = SERVERS[hostname]
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(info["ip"], username=info["user"], password=info["pw"], timeout=10)
    return client


def ssh_exec(client, cmd, hostname="", check=True):
    """SSH 명령 실행 + 결과 출력."""
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        for line in out.splitlines():
            print(f"  [{hostname}] {line}")
    if err and rc != 0:
        for line in err.splitlines():
            print(f"  [{hostname}] ERR: {line}")
    if check and rc != 0:
        print(f"  [{hostname}] WARNING: exit code {rc}")
    return out, err, rc


def sftp_put_file(client, local_path, remote_path):
    """파일 전송."""
    sftp = client.open_sftp()
    sftp.put(local_path, remote_path)
    sftp.close()


def sftp_put_string(client, content, remote_path, mode=0o644):
    """문자열을 원격 파일로 전송."""
    sftp = client.open_sftp()
    with sftp.file(remote_path, "w") as f:
        f.write(content)
    sftp.chmod(remote_path, mode)
    sftp.close()


def sftp_put_dir(client, local_dir, remote_dir):
    """디렉토리 재귀 전송."""
    sftp = client.open_sftp()
    _sftp_put_dir_recursive(sftp, local_dir, remote_dir)
    sftp.close()


def _sftp_put_dir_recursive(sftp, local, remote):
    """재귀 디렉토리 전송 헬퍼."""
    try:
        sftp.stat(remote)
    except FileNotFoundError:
        sftp.mkdir(remote)

    for item in os.listdir(local):
        local_path = os.path.join(local, item)
        remote_path = remote + "/" + item
        if item.startswith("__pycache__") or item.startswith("."):
            continue
        if os.path.isdir(local_path):
            if item in ("dist", "build", "rpmbuild", "installer", "RPMS"):
                continue
            _sftp_put_dir_recursive(sftp, local_path, remote_path)
        else:
            sftp.put(local_path, remote_path)


# ═════════════════════════════════════════════════════════
# Phase 0: 모든 서버 기본 패키지 설치
# ═════════════════════════════════════════════════════════
def phase0_prerequisites():
    """모든 서버에 Python3 등 기본 패키지 설치."""
    print("\n" + "=" * 60)
    print(" Phase 0: 사전 요구사항 확인")
    print("=" * 60)
    for name, info in SERVERS.items():
        print(f"\n[{name}] {info['ip']} ({info['role']})...")
        client = ssh_connect(name)
        ssh_exec(client, "hostname", name)
        ssh_exec(client, "dnf install -y python3 openssl 2>&1 | tail -3", name, check=False)
        client.close()


# ═════════════════════════════════════════════════════════
# Phase 1: TLS 인증서 생성 (ttt1에서 CA 생성, 각 서버 배포)
# ═════════════════════════════════════════════════════════
def phase1_tls_certificates():
    """내부 CA 생성 및 각 서버 인증서 발급."""
    print("\n" + "=" * 60)
    print(" Phase 1: TLS 인증서 생성")
    print("=" * 60)

    client = ssh_connect("ttt1")

    # CA 생성
    ssh_exec(client, "mkdir -p /etc/blossom/lumina/tls", "ttt1")
    ssh_exec(client, """
cd /etc/blossom/lumina/tls
if [ ! -f ca.key ]; then
    openssl genrsa -out ca.key 4096 2>/dev/null
    openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
        -subj "/C=KR/O=Blossom/CN=Lumina Internal CA" 2>/dev/null
    chmod 600 ca.key
    echo "CA 인증서 생성 완료"
else
    echo "CA 이미 존재 — 재사용"
fi
""", "ttt1")

    # 각 서버별 인증서 생성 (SAN 포함)
    for name, info in SERVERS.items():
        ip = info["ip"]
        ssh_exec(client, f"""
cd /etc/blossom/lumina/tls
# 서버 인증서 생성
openssl genrsa -out {name}.key 2048 2>/dev/null
cat > /tmp/{name}_ext.cnf << EOF
[req]
distinguished_name = req_dn
req_extensions = v3_req
[req_dn]
[v3_req]
subjectAltName = DNS:{name},IP:{ip}
EOF
openssl req -new -key {name}.key -out {name}.csr \
    -subj "/C=KR/O=Blossom/CN={name}" 2>/dev/null
openssl x509 -req -in {name}.csr -CA ca.crt -CAkey ca.key \
    -CAcreateserial -out {name}.crt -days 365 \
    -extfile /tmp/{name}_ext.cnf -extensions v3_req 2>/dev/null
chmod 600 {name}.key
rm -f {name}.csr /tmp/{name}_ext.cnf
echo "{name} 인증서 생성 완료"
""", "ttt1")

    # ttt1 자신의 서버 인증서 = ttt1.crt
    ssh_exec(client, """
cd /etc/blossom/lumina/tls
cp -f ttt1.crt server.crt
cp -f ttt1.key server.key
chmod 600 server.key
echo "ttt1 서버 인증서 배치 완료"
""", "ttt1")

    # 다른 서버에 인증서 배포
    # 먼저 ttt1 에서 각 인증서 파일을 읽어서 다른 서버에 전송
    sftp = client.open_sftp()

    # CA cert 읽기
    with sftp.file("/etc/blossom/lumina/tls/ca.crt", "r") as f:
        ca_crt = f.read().decode()

    certs = {}
    for name in ["ttt2", "ttt3", "ttt4"]:
        with sftp.file(f"/etc/blossom/lumina/tls/{name}.crt", "r") as f:
            certs[f"{name}.crt"] = f.read().decode()
        with sftp.file(f"/etc/blossom/lumina/tls/{name}.key", "r") as f:
            certs[f"{name}.key"] = f.read().decode()

    sftp.close()
    client.close()

    # 각 서버에 배포
    for name in ["ttt2", "ttt3", "ttt4"]:
        print(f"\n  {name}에 인증서 배포...")
        c = ssh_connect(name)
        ssh_exec(c, "mkdir -p /etc/blossom/lumina/tls", name)
        sftp_put_string(c, ca_crt, "/etc/blossom/lumina/tls/ca.crt")
        sftp_put_string(c, certs[f"{name}.crt"], "/etc/blossom/lumina/tls/server.crt")
        sftp_put_string(c, certs[f"{name}.key"], "/etc/blossom/lumina/tls/server.key", 0o600)

        # Agent용 클라이언트 인증서 (ttt4)
        if name == "ttt4":
            sftp_put_string(c, certs["ttt4.crt"], "/etc/blossom/lumina/tls/client.crt")
            sftp_put_string(c, certs["ttt4.key"], "/etc/blossom/lumina/tls/client.key", 0o600)

        ssh_exec(c, "ls -la /etc/blossom/lumina/tls/", name)
        c.close()

    print("\n  TLS 인증서 전체 배포 완료")


# ═════════════════════════════════════════════════════════
# Phase 2: ttt1 — DB 서버 설치
# ═════════════════════════════════════════════════════════
def phase2_db_server():
    """ttt1: MariaDB 설치 및 Lumina DB 초기화."""
    print("\n" + "=" * 60)
    print(" Phase 2: ttt1 (DB) — MariaDB 설치 + Lumina 초기화")
    print("=" * 60)

    client = ssh_connect("ttt1")

    # MariaDB 설치
    ssh_exec(client, "dnf install -y mariadb-server mariadb 2>&1 | tail -5", "ttt1", check=False)

    # MariaDB 시작
    ssh_exec(client, "systemctl start mariadb && systemctl enable mariadb", "ttt1")
    ssh_exec(client, "systemctl is-active mariadb", "ttt1")

    # 보안 설정 파일 배치 (TLS는 인증서 설치 후 활성화하므로 일부 주석)
    lumina_security_cnf = """
[mysqld]
character_set_server = utf8mb4
collation_server = utf8mb4_unicode_ci
init_connect = 'SET NAMES utf8mb4'
max_connections = 200
wait_timeout = 300
interactive_timeout = 300
connect_timeout = 10
innodb_buffer_pool_size = 256M
innodb_log_file_size = 64M
innodb_flush_log_at_trx_commit = 2
innodb_file_per_table = ON
bulk_insert_buffer_size = 64M
slow_query_log = ON
slow_query_log_file = /var/log/mariadb/lumina-slow.log
long_query_time = 2
local_infile = OFF
symbolic_links = OFF
event_scheduler = ON
skip_name_resolve = ON

[client]
default_character_set = utf8mb4

[mysql]
default_character_set = utf8mb4
"""
    sftp_put_string(client, lumina_security_cnf,
                    "/etc/my.cnf.d/lumina-security.cnf")

    # slow query 로그 디렉토리
    ssh_exec(client, "mkdir -p /var/log/mariadb && chown mysql:mysql /var/log/mariadb", "ttt1")

    # MariaDB 재시작 (설정 적용)
    ssh_exec(client, "systemctl restart mariadb", "ttt1")

    # 초기화 SQL 전송 및 실행 (비밀번호 치환)
    sql_path = os.path.join(DEPLOY_DIR, "sql", "init.sql")
    with open(sql_path, encoding="utf-8") as f:
        init_sql = f.read()

    # 비밀번호 치환
    init_sql = init_sql.replace("CHANGE_ME_AP_WRITER_PASSWORD", DB_AP_PW)
    init_sql = init_sql.replace("CHANGE_ME_WEB_READER_PASSWORD", DB_WEB_PW)
    init_sql = init_sql.replace("CHANGE_ME_ADMIN_PASSWORD", DB_ADMIN_PW)

    # REQUIRE SSL 제거 (인증서 설정 전에는 SSL 없이 운영)
    init_sql = init_sql.replace("REQUIRE SSL", "")

    sftp_put_string(client, init_sql, "/tmp/lumina_init.sql")

    # SQL 실행
    print("\n  DB 초기화 SQL 실행 중...")
    ssh_exec(client, "mysql -u root < /tmp/lumina_init.sql 2>&1", "ttt1", check=False)
    ssh_exec(client, "rm -f /tmp/lumina_init.sql", "ttt1")

    # DB 검증
    print("\n  DB 검증:")
    ssh_exec(client, f"mysql -u lumina_ap_writer -p'{DB_AP_PW}' -e 'USE lumina; SHOW TABLES;' 2>&1", "ttt1")

    # 원격 접속 허용 (방화벽)
    ssh_exec(client, """
firewall-cmd --permanent --add-port=3306/tcp 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true
echo "방화벽 3306 오픈"
""", "ttt1", check=False)

    client.close()
    print("\n  ttt1 (DB) 설치 완료")


# ═════════════════════════════════════════════════════════
# Phase 3: 모든 서버에 공통 모듈 + 에이전트 코드 배포
# ═════════════════════════════════════════════════════════
def phase3_deploy_code():
    """모든 서버에 Lumina 코드 배포 (RPM 대신 직접 복사)."""
    print("\n" + "=" * 60)
    print(" Phase 3: 코드 배포 (전 서버)")
    print("=" * 60)

    for name, info in SERVERS.items():
        print(f"\n[{name}] {info['ip']} ({info['role']}) 코드 배포...")
        client = ssh_connect(name)

        # 디렉토리 생성
        ssh_exec(client, """
mkdir -p /opt/blossom/lumina/{common,bin}
mkdir -p /etc/blossom/lumina/tls
mkdir -p /var/lib/blossom/lumina
mkdir -p /var/log/blossom/lumina
mkdir -p /run/blossom/lumina
""", name)

        # common 모듈 전송
        sftp_put_dir(client, os.path.join(AGENTS_DIR, "common"),
                     "/opt/blossom/lumina/common")
        print(f"  [{name}] common/ 전송 완료")

        # 설정 파일 전송 (기존 파일 보존)
        conf_dir = os.path.join(DEPLOY_DIR, "conf")
        sftp_put_file(client, os.path.join(conf_dir, "common.conf"),
                      "/etc/blossom/lumina/common.conf")

        # 역할별 코드 배포
        role = info["role"]

        if role == "Agent":
            # Agent 코드 배포
            ssh_exec(client, "mkdir -p /opt/blossom/lumina/agent/collectors", name)
            agent_dir = os.path.join(AGENTS_DIR, "linux")
            sftp = client.open_sftp()
            sftp.put(os.path.join(agent_dir, "agent.py"),
                     "/opt/blossom/lumina/agent/agent.py")
            try:
                sftp.put(os.path.join(agent_dir, "__init__.py"),
                         "/opt/blossom/lumina/agent/__init__.py")
            except Exception:
                sftp_put_string(client, "", "/opt/blossom/lumina/agent/__init__.py")
            for f in ["__init__.py", "interface.py", "account.py", "package.py"]:
                fp = os.path.join(agent_dir, "collectors", f)
                if os.path.exists(fp):
                    sftp.put(fp, f"/opt/blossom/lumina/agent/collectors/{f}")
                else:
                    with sftp.file(f"/opt/blossom/lumina/agent/collectors/{f}", "w") as fh:
                        fh.write("")
            sftp.close()

            # agent.py 내 import 경로 패치
            ssh_exec(client, r"""
cd /opt/blossom/lumina/agent
# sys.path를 /opt/blossom/lumina 로 변경
sed -i 's|os.path.join(os.path.dirname(__file__), "..")|"/opt/blossom/lumina"|' agent.py
# import 경로 패치: linux.collectors -> agent.collectors
sed -i 's/from linux\.collectors\./from agent.collectors./' agent.py
echo "import 경로 패치 완료"
""", name)

            # collectors 내 import 경로 패치
            ssh_exec(client, r"""
cd /opt/blossom/lumina/agent/collectors
for f in interface.py account.py package.py; do
    if [ -f "$f" ]; then
        sed -i '/sys\.path\.insert/d' "$f"
        sed -i 's|os.path.abspath.*||' "$f"
        echo "  $f 패치 완료"
    fi
done
""", name)

            # Agent 설정 파일
            agent_conf = f"""[server]
host = 192.168.56.106
port = 5100
protocol = https
verify_ssl = false

[tls]
ca_cert = /etc/blossom/lumina/tls/ca.crt
client_cert = /etc/blossom/lumina/tls/client.crt
client_key = /etc/blossom/lumina/tls/client.key

[agent]
interval = 60
collectors = interface, account, package
output_dir = /var/lib/blossom/lumina/agent
queue_dir = /var/lib/blossom/lumina/agent/queue

[retry]
max_attempts = 3
backoff_base = 10
backoff_max = 300

[logging]
log_dir = /var/log/blossom/lumina/agent
log_level = INFO
log_file = /var/log/blossom/lumina/agent/lumina-agent.log

[security]
auth_token = {AP_AUTH_TOKEN}
mask_sensitive = true

[privacy]
collect_passwords = false
"""
            sftp_put_string(client, agent_conf, "/etc/blossom/lumina/agent.conf", 0o640)

            # 서비스 계정 + 디렉터리
            ssh_exec(client, """
id lumina 2>/dev/null || useradd -r -s /sbin/nologin -d /opt/blossom/lumina/agent lumina
mkdir -p /var/lib/blossom/lumina/agent/queue
mkdir -p /var/log/blossom/lumina/agent
chown -R lumina:lumina /var/lib/blossom/lumina/agent /var/log/blossom/lumina/agent
chmod 750 /var/lib/blossom/lumina/agent /var/log/blossom/lumina/agent
""", name)

            # systemd unit
            service = """[Unit]
Description=Blossom Lumina Agent (Asset Discovery)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=lumina
Group=lumina
ExecStart=/usr/bin/python3 /opt/blossom/lumina/agent/agent.py --conf /etc/blossom/lumina/agent.conf
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lumina-agent
ProtectSystem=full
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
"""
            sftp_put_string(client, service, "/etc/systemd/system/lumina-agent.service")
            ssh_exec(client, "systemctl daemon-reload", name)

            # CLI wrapper
            cli_wrapper = """#!/bin/bash
exec /usr/bin/python3 /opt/blossom/lumina/agent/agent.py --conf /etc/blossom/lumina/agent.conf "$@"
"""
            sftp_put_string(client, cli_wrapper, "/usr/bin/lumina-agent", 0o755)

            print(f"  [{name}] Agent 배포 완료")

        elif role == "AP":
            # AP 서버 코드 배포
            ssh_exec(client, "mkdir -p /opt/blossom/lumina/ap", name)
            ssh_exec(client, "dnf install -y python3-pip 2>&1 | tail -3", name, check=False)
            ssh_exec(client, "pip3 install flask pymysql 2>&1 | tail -3", name, check=False)

            # ap 모듈 생성
            ap_init = '"""Blossom Lumina AP."""\n__version__ = "2.0.0"\n'
            sftp_put_string(client, ap_init, "/opt/blossom/lumina/ap/__init__.py")

            # AP 수신 서버 (Flask 기반)
            ap_server = '''#!/usr/bin/env python3
"""Blossom Lumina AP — 데이터 수신/처리/적재 서버."""

import json
import logging
import os
import sys
import time
import hmac
import hashlib
from datetime import datetime

sys.path.insert(0, "/opt/blossom/lumina")

from flask import Flask, request, jsonify

logger = logging.getLogger("lumina.ap")

# ── DB 연결 (환경변수에서 비밀번호 취득) ──────────────────
DB_CONFIG = {
    "host": os.environ.get("LUMINA_DB_HOST", "192.168.56.107"),
    "port": int(os.environ.get("LUMINA_DB_PORT", 3306)),
    "user": os.environ.get("LUMINA_DB_AP_USER", "lumina_ap_writer"),
    "password": os.environ.get("LUMINA_DB_AP_PASSWORD", "''' + DB_AP_PW + '''"),
    "database": "lumina",
    "charset": "utf8mb4",
}

AUTH_TOKEN = os.environ.get("LUMINA_AP_AUTH_TOKEN", "''' + AP_AUTH_TOKEN + '''")


def get_db():
    """MariaDB 연결."""
    import pymysql
    return pymysql.connect(**DB_CONFIG)


def upsert_host(conn, payload):
    """호스트 UPSERT → host_id 반환."""
    hostname = payload.get("hostname", "unknown")
    os_type = payload.get("os_type", "")
    os_version = payload.get("os_version", "")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM collected_hosts WHERE hostname = %s",
            (hostname,)
        )
        row = cur.fetchone()
        if row:
            host_id = row[0]
            cur.execute(
                "UPDATE collected_hosts SET os_type=%s, os_version=%s, "
                "last_seen=NOW(), is_active=1 WHERE id=%s",
                (os_type, os_version, host_id)
            )
        else:
            cur.execute(
                "INSERT INTO collected_hosts (hostname, os_type, os_version) "
                "VALUES (%s, %s, %s)",
                (hostname, os_type, os_version)
            )
            host_id = cur.lastrowid
    return host_id


def upsert_interfaces(conn, host_id, interfaces, collected_at):
    """인터페이스 데이터 UPSERT."""
    if not interfaces:
        return 0
    with conn.cursor() as cur:
        # 기존 데이터 삭제 후 재삽입 (전체 갱신)
        cur.execute("DELETE FROM collected_interfaces WHERE host_id = %s", (host_id,))
        count = 0
        for iface in interfaces:
            iface_name = iface.get("iface", "")
            ips = iface.get("ip_addresses", [])
            slot = iface.get("slot", "")
            serial = iface.get("serial", "")
            if ips:
                for ip_entry in ips:
                    cur.execute(
                        "INSERT INTO collected_interfaces "
                        "(host_id, name, ip_address, mac_address, slot, status, collected_at) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (host_id, iface_name,
                         ip_entry.get("ip_address", ""),
                         serial, slot,
                         ip_entry.get("status", "활성"),
                         collected_at)
                    )
                    count += 1
            else:
                cur.execute(
                    "INSERT INTO collected_interfaces "
                    "(host_id, name, mac_address, slot, status, collected_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (host_id, iface_name, serial, slot, "활성", collected_at)
                )
                count += 1
    return count


def upsert_accounts(conn, host_id, accounts, collected_at):
    """계정 데이터 UPSERT."""
    if not accounts:
        return 0
    with conn.cursor() as cur:
        cur.execute("DELETE FROM collected_accounts WHERE host_id = %s", (host_id,))
        count = 0
        for acct in accounts:
            cur.execute(
                "INSERT INTO collected_accounts "
                "(host_id, username, uid, gid, shell, is_system, is_locked, collected_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (host_id,
                 acct.get("account_name", ""),
                 acct.get("uid", 0),
                 acct.get("gid", 0),
                 acct.get("remark", ""),
                 1 if acct.get("account_type") != "사용자" else 0,
                 0 if acct.get("login_allowed", True) else 1,
                 collected_at)
            )
            count += 1
    return count


def upsert_packages(conn, host_id, packages, collected_at):
    """패키지 데이터 UPSERT."""
    if not packages:
        return 0
    with conn.cursor() as cur:
        cur.execute("DELETE FROM collected_packages WHERE host_id = %s", (host_id,))
        count = 0
        for pkg in packages:
            cur.execute(
                "INSERT INTO collected_packages "
                "(host_id, name, version, source, collected_at) "
                "VALUES (%s, %s, %s, %s, %s)",
                (host_id,
                 pkg.get("package_name", ""),
                 pkg.get("version", ""),
                 pkg.get("package_type", ""),
                 collected_at)
            )
            count += 1
    return count


def create_app():
    app = Flask(__name__)

    @app.route("/api/agent/upload", methods=["POST"])
    def agent_upload():
        # 인증 검증
        auth = request.headers.get("Authorization", "")
        enrollment = request.headers.get("X-Enrollment-Token", "")
        token = ""
        if auth.startswith("Bearer "):
            token = auth[7:]
        elif enrollment:
            token = enrollment

        if AUTH_TOKEN and token != AUTH_TOKEN:
            logger.warning("인증 실패: ip=%s", request.remote_addr)
            return jsonify({"success": False, "error": "Unauthorized"}), 401

        try:
            payload = request.get_json(force=True)
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 400

        hostname = payload.get("hostname", "unknown")
        collected_at = payload.get("collected_at", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
        interfaces = payload.get("interfaces", [])
        accounts = payload.get("accounts", [])
        packages = payload.get("packages", [])

        logger.info("수신: hostname=%s, interfaces=%d, accounts=%d, packages=%d",
                     hostname, len(interfaces), len(accounts), len(packages))

        try:
            conn = get_db()
            host_id = upsert_host(conn, payload)
            i_cnt = upsert_interfaces(conn, host_id, interfaces, collected_at)
            a_cnt = upsert_accounts(conn, host_id, accounts, collected_at)
            p_cnt = upsert_packages(conn, host_id, packages, collected_at)

            # collection_log 기록
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO collection_log "
                    "(host_id, collected_at, interface_count, account_count, "
                    "package_count, payload_size, status, source_ip) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (host_id, collected_at, i_cnt, a_cnt, p_cnt,
                     request.content_length or 0, "success", request.remote_addr)
                )

            conn.commit()
            conn.close()

            result = {
                "success": True,
                "hostname": hostname,
                "host_id": host_id,
                "results": {
                    "interfaces": i_cnt,
                    "accounts": a_cnt,
                    "packages": p_cnt,
                },
            }
            logger.info("적재 완료: %s (iface=%d, acct=%d, pkg=%d)",
                        hostname, i_cnt, a_cnt, p_cnt)
            return jsonify(result), 200

        except Exception as e:
            logger.exception("DB 적재 실패: %s", e)
            return jsonify({"success": False, "error": str(e)}), 500

    @app.route("/api/agent/heartbeat", methods=["POST"])
    def heartbeat():
        return jsonify({"status": "ok"}), 200

    @app.route("/health", methods=["GET"])
    def health():
        try:
            conn = get_db()
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            conn.close()
            return jsonify({"status": "ok", "db": "connected"}), 200
        except Exception as e:
            return jsonify({"status": "error", "db": str(e)}), 503

    return app


def main():
    import argparse
    import ssl

    parser = argparse.ArgumentParser(description="Lumina AP Server")
    parser.add_argument("--config", default="/etc/blossom/lumina/ap.conf")
    parser.add_argument("--port", type=int, default=5100)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--no-tls", action="store_true", help="Disable TLS (dev only)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler("/var/log/blossom/lumina/ap/ap.log",
                                encoding="utf-8"),
        ],
    )

    app = create_app()

    ssl_ctx = None
    if not args.no_tls:
        cert = "/etc/blossom/lumina/tls/server.crt"
        key = "/etc/blossom/lumina/tls/server.key"
        if os.path.exists(cert) and os.path.exists(key):
            ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_ctx.load_cert_chain(cert, key)
            ca = "/etc/blossom/lumina/tls/ca.crt"
            if os.path.exists(ca):
                ssl_ctx.load_verify_locations(ca)
            logger.info("TLS 활성화: cert=%s", cert)
        else:
            logger.warning("TLS 인증서 미발견 — 평문 모드로 기동")

    logger.info("AP 서버 시작: %s:%d (TLS=%s)", args.host, args.port,
                "ON" if ssl_ctx else "OFF")
    app.run(host=args.host, port=args.port, ssl_context=ssl_ctx, debug=False)


if __name__ == "__main__":
    main()
'''
            sftp_put_string(client, ap_server, "/opt/blossom/lumina/ap/server.py", 0o755)

            # AP 설정
            ap_conf = os.path.join(DEPLOY_DIR, "conf", "ap.conf")
            sftp_put_file(client, ap_conf, "/etc/blossom/lumina/ap.conf")
            db_conf = os.path.join(DEPLOY_DIR, "conf", "db.conf")
            sftp_put_file(client, db_conf, "/etc/blossom/lumina/db.conf")

            # secure.env
            secure_env = f"""LUMINA_DB_HOST=192.168.56.107
LUMINA_DB_PORT=3306
LUMINA_DB_AP_USER=lumina_ap_writer
LUMINA_DB_AP_PASSWORD={DB_AP_PW}
LUMINA_AP_AUTH_TOKEN={AP_AUTH_TOKEN}
"""
            sftp_put_string(client, secure_env, "/etc/blossom/lumina/secure.env", 0o600)

            # 서비스 계정
            ssh_exec(client, """
id lumina-ap 2>/dev/null || useradd -r -s /sbin/nologin -d /opt/blossom/lumina/ap lumina-ap
mkdir -p /var/lib/blossom/lumina/ap/{queue,failed,raw}
mkdir -p /var/log/blossom/lumina/ap
chown -R lumina-ap:lumina-ap /var/lib/blossom/lumina/ap /var/log/blossom/lumina/ap
chmod 750 /var/lib/blossom/lumina/ap /var/log/blossom/lumina/ap
# lumina-ap가 tls 파일 읽을 수 있도록
chmod 644 /etc/blossom/lumina/tls/ca.crt /etc/blossom/lumina/tls/server.crt 2>/dev/null || true
""", name)

            # systemd unit
            ap_service = """[Unit]
Description=Blossom Lumina AP Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
EnvironmentFile=-/etc/blossom/lumina/secure.env
ExecStart=/usr/bin/python3 /opt/blossom/lumina/ap/server.py --port 5100
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lumina-ap
WorkingDirectory=/opt/blossom/lumina/ap

[Install]
WantedBy=multi-user.target
"""
            sftp_put_string(client, ap_service, "/etc/systemd/system/lumina-ap.service")
            ssh_exec(client, "systemctl daemon-reload", name)

            # 방화벽
            ssh_exec(client, """
firewall-cmd --permanent --add-port=5100/tcp 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true
""", name, check=False)

            print(f"  [{name}] AP 배포 완료")

        elif role == "WEB":
            # WEB 서버 배포
            ssh_exec(client, "dnf install -y python3-pip nginx 2>&1 | tail -5", name, check=False)
            ssh_exec(client, "pip3 install flask pymysql gunicorn 2>&1 | tail -3", name, check=False)

            ssh_exec(client, "mkdir -p /opt/blossom/lumina/web/app/{routes,templates,static}", name)

            # Flask 앱
            web_app = '''#!/usr/bin/env python3
"""Blossom Lumina WEB — 대시보드."""

import os
import sys
import json
import logging

sys.path.insert(0, "/opt/blossom/lumina")

from flask import Flask, render_template_string, jsonify

logger = logging.getLogger("lumina.web")

DB_CONFIG = {
    "host": os.environ.get("LUMINA_DB_HOST", "192.168.56.107"),
    "port": int(os.environ.get("LUMINA_DB_PORT", 3306)),
    "user": os.environ.get("LUMINA_DB_WEB_USER", "lumina_web_reader"),
    "password": os.environ.get("LUMINA_DB_WEB_PASSWORD", "''' + DB_WEB_PW + '''"),
    "database": "lumina",
    "charset": "utf8mb4",
}


def get_db():
    import pymysql
    return pymysql.connect(**DB_CONFIG)


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("LUMINA_SECRET_KEY", os.urandom(32).hex())
    app.config["DEBUG"] = False

    DASHBOARD_HTML = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Lumina Dashboard</title>
    <style>
        body { margin:0; padding:20px; background:#0f172a; color:#e2e8f0; font-family:sans-serif; }
        h1 { color:#38bdf8; margin-bottom:5px; }
        .subtitle { color:#94a3b8; margin-bottom:30px; }
        .cards { display:flex; gap:20px; flex-wrap:wrap; }
        .card { background:#1e293b; border-radius:12px; padding:24px; min-width:200px;
                border:1px solid #334155; }
        .card h2 { font-size:14px; color:#94a3b8; margin:0 0 8px 0; text-transform:uppercase; }
        .card .num { font-size:36px; font-weight:bold; color:#38bdf8; }
        table { width:100%; border-collapse:collapse; margin-top:30px; }
        th { text-align:left; padding:12px; background:#1e293b; color:#94a3b8;
             border-bottom:2px solid #334155; font-size:13px; text-transform:uppercase; }
        td { padding:10px 12px; border-bottom:1px solid #1e293b; }
        .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; }
        .badge-ok { background:#064e3b; color:#6ee7b7; }
        .badge-inactive { background:#7f1d1d; color:#fca5a5; }
    </style>
</head>
<body>
    <h1>Blossom Lumina</h1>
    <p class="subtitle">IT Asset Discovery Dashboard</p>
    <div class="cards">
        <div class="card"><h2>Hosts</h2><div class="num">{{ hosts }}</div></div>
        <div class="card"><h2>Interfaces</h2><div class="num">{{ interfaces }}</div></div>
        <div class="card"><h2>Accounts</h2><div class="num">{{ accounts }}</div></div>
        <div class="card"><h2>Packages</h2><div class="num">{{ packages }}</div></div>
    </div>
    <table>
        <tr><th>Hostname</th><th>OS</th><th>Last Seen</th><th>Status</th>
            <th>Interfaces</th><th>Accounts</th><th>Packages</th></tr>
        {% for h in host_list %}
        <tr>
            <td>{{ h.hostname }}</td>
            <td>{{ h.os_type }}</td>
            <td>{{ h.last_seen }}</td>
            <td>{% if h.is_active %}<span class="badge badge-ok">Active</span>
                {% else %}<span class="badge badge-inactive">Inactive</span>{% endif %}</td>
            <td>{{ h.iface_cnt }}</td>
            <td>{{ h.acct_cnt }}</td>
            <td>{{ h.pkg_cnt }}</td>
        </tr>
        {% endfor %}
    </table>
</body>
</html>"""

    @app.route("/")
    def dashboard():
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM collected_hosts")
            hosts = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM collected_interfaces")
            interfaces = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM collected_accounts")
            accounts_cnt = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM collected_packages")
            packages_cnt = cur.fetchone()[0]

            cur.execute("""
                SELECT h.hostname, h.os_type, h.last_seen, h.is_active,
                    (SELECT COUNT(*) FROM collected_interfaces WHERE host_id=h.id) as iface_cnt,
                    (SELECT COUNT(*) FROM collected_accounts WHERE host_id=h.id) as acct_cnt,
                    (SELECT COUNT(*) FROM collected_packages WHERE host_id=h.id) as pkg_cnt
                FROM collected_hosts h ORDER BY h.last_seen DESC LIMIT 50
            """)
            rows = cur.fetchall()
            host_list = []
            for r in rows:
                host_list.append({
                    "hostname": r[0], "os_type": r[1],
                    "last_seen": str(r[2]) if r[2] else "", "is_active": r[3],
                    "iface_cnt": r[4], "acct_cnt": r[5], "pkg_cnt": r[6],
                })
            conn.close()
            return render_template_string(DASHBOARD_HTML,
                hosts=hosts, interfaces=interfaces,
                accounts=accounts_cnt, packages=packages_cnt,
                host_list=host_list)
        except Exception as e:
            return f"<h1>DB Error</h1><pre>{e}</pre>", 500

    @app.route("/api/dashboard/summary")
    def api_summary():
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM collected_hosts WHERE is_active=1")
            active = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM collected_interfaces")
            ifaces = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM collected_accounts")
            accts = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM collected_packages")
            pkgs = cur.fetchone()[0]
            conn.close()
            return jsonify({"active_hosts": active, "interfaces": ifaces,
                           "accounts": accts, "packages": pkgs})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/health")
    def health():
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT 1")
            conn.close()
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            return jsonify({"status": "error", "detail": str(e)}), 503

    return app
'''
            sftp_put_string(client, web_app, "/opt/blossom/lumina/web/app/__init__.py")

            wsgi_py = """import sys
sys.path.insert(0, "/opt/blossom/lumina")
from web.app import create_app
application = create_app()
"""
            sftp_put_string(client, wsgi_py, "/opt/blossom/lumina/web/wsgi.py")

            gunicorn_conf = """import multiprocessing
bind = "127.0.0.1:8000"
workers = 2
worker_class = "gthread"
threads = 2
timeout = 30
accesslog = "/var/log/blossom/lumina/web/gunicorn.log"
errorlog = "/var/log/blossom/lumina/web/gunicorn-error.log"
loglevel = "info"
"""
            sftp_put_string(client, gunicorn_conf, "/opt/blossom/lumina/web/gunicorn.conf.py")

            # secure.env
            import secrets
            secret_key = secrets.token_hex(32)
            secure_env = f"""LUMINA_SECRET_KEY={secret_key}
LUMINA_DB_HOST=192.168.56.107
LUMINA_DB_PORT=3306
LUMINA_DB_WEB_USER=lumina_web_reader
LUMINA_DB_WEB_PASSWORD={DB_WEB_PW}
"""
            sftp_put_string(client, secure_env, "/etc/blossom/lumina/secure.env", 0o600)

            # 서비스 계정
            ssh_exec(client, """
id lumina-web 2>/dev/null || useradd -r -s /sbin/nologin -d /opt/blossom/lumina/web lumina-web
mkdir -p /var/lib/blossom/lumina/web
mkdir -p /var/log/blossom/lumina/web
chown -R lumina-web:lumina-web /var/lib/blossom/lumina/web /var/log/blossom/lumina/web
""", name)

            # systemd unit (Gunicorn)
            web_service = """[Unit]
Description=Blossom Lumina WEB Server (Gunicorn)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
EnvironmentFile=-/etc/blossom/lumina/secure.env
ExecStart=/usr/local/bin/gunicorn --config /opt/blossom/lumina/web/gunicorn.conf.py --chdir /opt/blossom/lumina/web wsgi:application
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lumina-web
WorkingDirectory=/opt/blossom/lumina/web

[Install]
WantedBy=multi-user.target
"""
            sftp_put_string(client, web_service, "/etc/systemd/system/lumina-web.service")

            # NGINX 설정 (단순 리버스 프록시)
            nginx_conf = """server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }

    location /static/ {
        alias /opt/blossom/lumina/web/app/static/;
        expires 7d;
    }
}
"""
            sftp_put_string(client, nginx_conf, "/etc/nginx/conf.d/lumina.conf")

            # 기본 nginx.conf에서 default server 제거
            ssh_exec(client, """
# default server block 비활성화
if [ -f /etc/nginx/nginx.conf ]; then
    sed -i '/server {/,/}/d' /etc/nginx/nginx.conf 2>/dev/null || true
fi
# 또는 default.conf 삭제
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
""", name, check=False)

            ssh_exec(client, "systemctl daemon-reload", name)

            # 방화벽
            ssh_exec(client, """
firewall-cmd --permanent --add-service=http 2>/dev/null || true
firewall-cmd --permanent --add-service=https 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true
""", name, check=False)

            print(f"  [{name}] WEB 배포 완료")

        client.close()


# ═════════════════════════════════════════════════════════
# Phase 4: 서비스 시작 + 검증
# ═════════════════════════════════════════════════════════
def phase4_start_services():
    """모든 서비스 시작."""
    print("\n" + "=" * 60)
    print(" Phase 4: 서비스 시작")
    print("=" * 60)

    # AP 서비스 시작
    print("\n[ttt2] AP 서비스 시작...")
    client = ssh_connect("ttt2")
    ssh_exec(client, "systemctl start lumina-ap && systemctl enable lumina-ap", "ttt2")
    time.sleep(2)
    ssh_exec(client, "systemctl status lumina-ap --no-pager | head -10", "ttt2")
    client.close()

    # WEB 서비스 시작
    print("\n[ttt3] WEB 서비스 시작...")
    client = ssh_connect("ttt3")
    ssh_exec(client, "systemctl start lumina-web && systemctl enable lumina-web", "ttt3")
    time.sleep(2)
    ssh_exec(client, "systemctl status lumina-web --no-pager | head -10", "ttt3")
    # NGINX
    ssh_exec(client, "nginx -t 2>&1", "ttt3", check=False)
    ssh_exec(client, "systemctl start nginx && systemctl enable nginx", "ttt3", check=False)
    ssh_exec(client, "systemctl status nginx --no-pager | head -5", "ttt3")
    client.close()

    # Agent 서비스 시작
    print("\n[ttt4] Agent 서비스 시작...")
    client = ssh_connect("ttt4")
    ssh_exec(client, "systemctl start lumina-agent && systemctl enable lumina-agent", "ttt4")
    time.sleep(2)
    ssh_exec(client, "systemctl status lumina-agent --no-pager | head -10", "ttt4")
    client.close()


def phase5_verify():
    """최종 검증."""
    print("\n" + "=" * 60)
    print(" Phase 5: 최종 검증")
    print("=" * 60)

    # AP 헬스체크
    print("\n[ttt2] AP 헬스체크:")
    client = ssh_connect("ttt2")
    ssh_exec(client, "curl -sk https://127.0.0.1:5100/health 2>&1 || curl -s http://127.0.0.1:5100/health 2>&1", "ttt2")
    client.close()

    # WEB 헬스체크
    print("\n[ttt3] WEB 헬스체크:")
    client = ssh_connect("ttt3")
    ssh_exec(client, "curl -s http://127.0.0.1:8000/health 2>&1", "ttt3")
    ssh_exec(client, "curl -s http://127.0.0.1/health 2>&1", "ttt3")
    client.close()

    # Agent 로그 확인
    print("\n[ttt4] Agent 로그 확인:")
    client = ssh_connect("ttt4")
    ssh_exec(client, "journalctl -u lumina-agent --no-pager -n 20 2>&1 | tail -15", "ttt4")
    client.close()

    # DB 데이터 확인
    print("\n[ttt1] DB 수집 데이터 확인:")
    client = ssh_connect("ttt1")
    ssh_exec(client, f"""
mysql -u lumina_web_reader -p'{DB_WEB_PW}' -e '
USE lumina;
SELECT "=== collected_hosts ===" AS "";
SELECT id, hostname, os_type, last_seen, is_active FROM collected_hosts;
SELECT "=== collected_interfaces (count) ===" AS "";
SELECT host_id, COUNT(*) as cnt FROM collected_interfaces GROUP BY host_id;
SELECT "=== collected_accounts (count) ===" AS "";
SELECT host_id, COUNT(*) as cnt FROM collected_accounts GROUP BY host_id;
SELECT "=== collected_packages (count) ===" AS "";
SELECT host_id, COUNT(*) as cnt FROM collected_packages GROUP BY host_id;
' 2>&1
""", "ttt1")
    client.close()

    print("\n" + "=" * 60)
    print(" 설치 완료 요약")
    print("=" * 60)
    print(f"  DB:    http://192.168.56.107:3306  (MariaDB)")
    print(f"  AP:    https://192.168.56.106:5100 (데이터 수신)")
    print(f"  WEB:   http://192.168.56.108       (대시보드)")
    print(f"  Agent: 192.168.56.109              (자산 수집)")
    print("=" * 60)


# ═════════════════════════════════════════════════════════
# Main
# ═════════════════════════════════════════════════════════
if __name__ == "__main__":
    try:
        phase0_prerequisites()
        phase1_tls_certificates()
        phase2_db_server()
        phase3_deploy_code()
        phase4_start_services()
        phase5_verify()
    except Exception as e:
        print(f"\n\n*** ERROR: {e}")
        traceback.print_exc()
        sys.exit(1)
