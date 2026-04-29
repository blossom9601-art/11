#!/usr/bin/env bash
###############################################################################
# Blossom Lumina — 전체 RPM 통합 빌드 스크립트 (5개 패키지)
# 빌드 대상: Common, Agent, DB-Init, AP, WEB
# 실행 환경: Rocky Linux 8.10+ (또는 WSL)
#
# 사용법:
#   chmod +x _build_lumina_all.sh
#   ./_build_lumina_all.sh
#
# 사전 요구사항:
#   dnf install rpm-build rpmdevtools dos2unix python3
###############################################################################
set -euo pipefail

# ── 경로 설정 ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# WSL 환경시 /mnt/c/... 경로 사용, 네이티브 Linux에서는 프로젝트 루트
if [[ "$SCRIPT_DIR" == /mnt/* ]]; then
    PROJECT_ROOT="$SCRIPT_DIR"
else
    PROJECT_ROOT="$SCRIPT_DIR"
fi

DEPLOY="$PROJECT_ROOT/deploy"
AGENTS="$PROJECT_ROOT/agents"
TOOLS="$PROJECT_ROOT/tools"
WORKDIR="/tmp/lumina-rpm-build-$$"
TOPDIR="$WORKDIR/rpmbuild"

echo "===== Blossom Lumina RPM 통합 빌드 시작 ====="
echo "  프로젝트: $PROJECT_ROOT"
echo "  작업 디렉터리: $WORKDIR"
echo ""

# ── 작업 디렉터리 초기화 ──────────────────────────────────
rm -rf "$WORKDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
SRC="$TOPDIR/SOURCES"

###############################################################################
# 1) 소스 파일 준비
###############################################################################
echo "[1/6] 소스 파일 복사 중..."

# ── common (agents/common/) ──────────────────────────────
mkdir -p "$SRC/common"
cp "$AGENTS/common/__init__.py"   "$SRC/common/"
cp "$AGENTS/common/config.py"     "$SRC/common/"
cp "$AGENTS/common/collector.py"  "$SRC/common/"
cp "$AGENTS/common/crypto.py"     "$SRC/common/"
cp "$AGENTS/common/masking.py"    "$SRC/common/"

# ── linux agent (agents/linux/) ──────────────────────────
mkdir -p "$SRC/linux/collectors"
cp "$AGENTS/linux/__init__.py"               "$SRC/linux/" 2>/dev/null || touch "$SRC/linux/__init__.py"
cp "$AGENTS/linux/agent.py"                  "$SRC/linux/"
cp "$AGENTS/linux/collectors/__init__.py"    "$SRC/linux/collectors/" 2>/dev/null || touch "$SRC/linux/collectors/__init__.py"
cp "$AGENTS/linux/collectors/interface.py"   "$SRC/linux/collectors/"
cp "$AGENTS/linux/collectors/account.py"     "$SRC/linux/collectors/"
cp "$AGENTS/linux/collectors/package.py"     "$SRC/linux/collectors/"

# ── conf ─────────────────────────────────────────────────
mkdir -p "$SRC/conf"
cp "$DEPLOY/conf/common.conf"   "$SRC/conf/"
cp "$DEPLOY/conf/secure.env"    "$SRC/conf/"
cp "$DEPLOY/conf/agent.conf"    "$SRC/conf/"
cp "$DEPLOY/conf/ap.conf"       "$SRC/conf/"
cp "$DEPLOY/conf/db.conf"       "$SRC/conf/"
cp "$DEPLOY/conf/web.conf"      "$SRC/conf/"

# ── sql ──────────────────────────────────────────────────
mkdir -p "$SRC/sql"
cp "$DEPLOY/sql/init.sql"       "$SRC/sql/"

# ── nginx ────────────────────────────────────────────────
mkdir -p "$SRC/nginx"
cp "$DEPLOY/nginx/lumina.conf"  "$SRC/nginx/"

# ── systemd ──────────────────────────────────────────────
mkdir -p "$SRC/systemd"
cp "$DEPLOY/systemd/lumina-agent.service" "$SRC/systemd/"
cp "$DEPLOY/systemd/lumina-ap.service"    "$SRC/systemd/"
cp "$DEPLOY/systemd/lumina-web.service"   "$SRC/systemd/"
cp "$DEPLOY/systemd/lumina-db.service"    "$SRC/systemd/"

# ── systemd drop-ins (mariadb / nginx 동반 정지) ─────────
mkdir -p "$SRC/systemd/dropins/mariadb.service.d"
mkdir -p "$SRC/systemd/dropins/nginx.service.d"
cp "$DEPLOY/systemd/dropins/mariadb.service.d/lumina.conf" "$SRC/systemd/dropins/mariadb.service.d/"
cp "$DEPLOY/systemd/dropins/nginx.service.d/lumina.conf"   "$SRC/systemd/dropins/nginx.service.d/"

###############################################################################
# 2) 누락 소스 파일 생성 (bin, cli, ap, web 스텁)
###############################################################################
echo "[2/6] 누락 소스 파일 생성 중..."

# ── bin/ 관리 스크립트 ───────────────────────────────────
mkdir -p "$SRC/bin"

cat > "$SRC/bin/lumina-healthcheck" << 'SHEOF'
#!/bin/bash
set -euo pipefail
CONFDIR="/etc/blossom/lumina"
OK=0; FAIL=0
check() {
    local name="$1" cmd="$2"
    if eval "$cmd" >/dev/null 2>&1; then
        echo "  [OK]   $name"; ((OK++))
    else
        echo "  [FAIL] $name"; ((FAIL++))
    fi
}
echo "=== Blossom Lumina Health Check ==="
check "TLS ca.crt"      "test -f $CONFDIR/tls/ca.crt"
check "TLS server.crt"  "test -f $CONFDIR/tls/server.crt"
check "TLS server.key"  "test -f $CONFDIR/tls/server.key"
check "lumina-agent"     "systemctl is-active lumina-agent"
check "lumina-ap"        "systemctl is-active lumina-ap"
check "lumina-web"       "systemctl is-active lumina-web"
check "nginx"            "systemctl is-active nginx"
check "mariadb"          "systemctl is-active mariadb"
echo ""
echo "결과: OK=$OK  FAIL=$FAIL"
exit $FAIL
SHEOF

cat > "$SRC/bin/lumina-rotate-token" << 'SHEOF'
#!/bin/bash
set -euo pipefail
SECURE_ENV="/etc/blossom/lumina/secure.env"
NEW_TOKEN=$(openssl rand -hex 32)
if [ -f "$SECURE_ENV" ]; then
    sed -i "s/^LUMINA_AP_AUTH_TOKEN=.*/LUMINA_AP_AUTH_TOKEN=$NEW_TOKEN/" "$SECURE_ENV"
    echo "토큰이 갱신되었습니다: $NEW_TOKEN"
    echo "※ 이 토큰을 모든 에이전트에 배포하세요."
else
    echo "ERROR: $SECURE_ENV 를 찾을 수 없습니다." >&2
    exit 1
fi
SHEOF

cat > "$SRC/bin/lumina-cert-renew" << 'SHEOF'
#!/bin/bash
set -euo pipefail
TLSDIR="/etc/blossom/lumina/tls"
echo "=== Blossom Lumina TLS 인증서 갱신 ==="
echo ""
echo "현재 인증서 만료일:"
openssl x509 -enddate -noout -in "$TLSDIR/server.crt" 2>/dev/null || \
    echo "  인증서를 찾을 수 없습니다: $TLSDIR/server.crt"
echo ""
echo "갱신 방법:"
echo "  1. 새 인증서를 $TLSDIR/ 에 배치"
echo "  2. systemctl restart lumina-ap lumina-web nginx"
SHEOF

# lumina CLI wrapper
cat > "$SRC/bin/lumina" << 'SHEOF'
#!/bin/bash
exec /usr/bin/python3 -m lumina_cli "$@"
SHEOF

chmod +x "$SRC/bin/lumina-healthcheck"
chmod +x "$SRC/bin/lumina-rotate-token"
chmod +x "$SRC/bin/lumina-cert-renew"
chmod +x "$SRC/bin/lumina"

# ── CLI 도구 ─────────────────────────────────────────────
if [ -d "$TOOLS/lumina_cli" ]; then
    echo "  CLI 도구 복사 (tools/lumina_cli)..."
    mkdir -p "$SRC/cli/lumina_cli/commands"
    cp "$TOOLS/lumina_cli/__init__.py"           "$SRC/cli/lumina_cli/" 2>/dev/null || touch "$SRC/cli/lumina_cli/__init__.py"
    cp "$TOOLS/lumina_cli/__main__.py"           "$SRC/cli/lumina_cli/" 2>/dev/null || true
    cp "$TOOLS/lumina_cli/main.py"               "$SRC/cli/lumina_cli/" 2>/dev/null || true
    cp "$TOOLS/lumina_cli/config.py"             "$SRC/cli/lumina_cli/" 2>/dev/null || true
    cp "$TOOLS/lumina_cli/api_client.py"         "$SRC/cli/lumina_cli/" 2>/dev/null || true
    cp "$TOOLS/lumina_cli/output.py"             "$SRC/cli/lumina_cli/" 2>/dev/null || true
    cp "$TOOLS/lumina_cli/commands/__init__.py"  "$SRC/cli/lumina_cli/commands/" 2>/dev/null || true
    cp "$TOOLS/lumina_cli/commands/agent.py"     "$SRC/cli/lumina_cli/commands/" 2>/dev/null || true
    cp "$TOOLS/lumina_cli/lumina-completion.bash" "$SRC/cli/" 2>/dev/null || true
else
    echo "  ⚠ CLI 도구 경로 없음 ($TOOLS/lumina_cli) — 스텁 생성"
    mkdir -p "$SRC/cli/lumina_cli/commands"
    echo '"""Lumina CLI."""' > "$SRC/cli/lumina_cli/__init__.py"
    echo '"""CLI main."""' > "$SRC/cli/lumina_cli/__main__.py"
    echo '"""CLI main."""' > "$SRC/cli/lumina_cli/main.py"
    echo '"""CLI config."""' > "$SRC/cli/lumina_cli/config.py"
    echo '"""API client."""' > "$SRC/cli/lumina_cli/api_client.py"
    echo '"""Output."""' > "$SRC/cli/lumina_cli/output.py"
    echo '"""Commands."""' > "$SRC/cli/lumina_cli/commands/__init__.py"
    echo '"""Agent commands."""' > "$SRC/cli/lumina_cli/commands/agent.py"
    echo '# lumina completion' > "$SRC/cli/lumina-completion.bash"
fi

# ── AP 서버 모듈 (스텁) ──────────────────────────────────
mkdir -p "$SRC/ap"
cat > "$SRC/ap/__init__.py" << 'PYEOF'
"""Blossom Lumina AP — 데이터 수신/처리/적재 서버."""
__version__ = "2.0.0"
PYEOF

cat > "$SRC/ap/receiver.py" << 'PYEOF'
"""TLS 수신 서버 — 에이전트 데이터 수신."""
import logging
logger = logging.getLogger("lumina.ap.receiver")

class AgentDataReceiver:
    def __init__(self, config):
        self.bind_host = config.get("bind_host", "0.0.0.0")
        self.bind_port = config.get("bind_port", 5100)

    def handle_upload(self, data):
        logger.info("데이터 수신: hostname=%s", data.get("hostname", "unknown"))
        return {"status": "accepted"}
PYEOF

cat > "$SRC/ap/queue.py" << 'PYEOF'
"""파일 기반 내부 큐."""
import os, json, time, logging
logger = logging.getLogger("lumina.ap.queue")

class FileQueue:
    def __init__(self, queue_dir="/var/lib/blossom/lumina/ap/queue"):
        self.queue_dir = queue_dir
        os.makedirs(queue_dir, exist_ok=True)

    def enqueue(self, data):
        fname = "%d.json" % int(time.time() * 1000)
        path = os.path.join(self.queue_dir, fname)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        return fname

    def dequeue(self):
        files = sorted(os.listdir(self.queue_dir))
        if not files:
            return None
        path = os.path.join(self.queue_dir, files[0])
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        os.unlink(path)
        return data
PYEOF

cat > "$SRC/ap/parser.py" << 'PYEOF'
"""JSON 스키마 검증."""
import logging
logger = logging.getLogger("lumina.ap.parser")
REQUIRED_FIELDS = ["hostname", "os_type", "collected_at"]

def validate(payload):
    errors = []
    for f in REQUIRED_FIELDS:
        if f not in payload:
            errors.append("필수 필드 누락: %s" % f)
    return (len(errors) == 0, errors)

def normalize(payload):
    payload["hostname"] = payload.get("hostname", "").strip().lower()
    return payload
PYEOF

cat > "$SRC/ap/worker.py" << 'PYEOF'
"""데이터 변환/마스킹 워커."""
import logging
logger = logging.getLogger("lumina.ap.worker")

class DataWorker:
    def __init__(self, queue, forwarder, masker=None):
        self.queue = queue
        self.forwarder = forwarder
        self.masker = masker

    def process_one(self):
        data = self.queue.dequeue()
        if data is None:
            return False
        if self.masker:
            data = self.masker(data)
        self.forwarder.forward(data)
        return True
PYEOF

cat > "$SRC/ap/forwarder.py" << 'PYEOF'
"""DB 적재 포워더."""
import logging
logger = logging.getLogger("lumina.ap.forwarder")

class DBForwarder:
    def __init__(self, db_config):
        self.db_config = db_config
        self._conn = None

    def connect(self):
        import pymysql
        self._conn = pymysql.connect(
            host=self.db_config["host"],
            port=int(self.db_config.get("port", 3306)),
            user=self.db_config["user"],
            password=self.db_config["password"],
            database=self.db_config["database"],
            charset="utf8mb4",
            ssl={"ca": self.db_config.get("ssl_ca", "")},
        )
        logger.info("DB 연결 성공")

    def forward(self, data):
        if self._conn is None:
            self.connect()
        logger.info("데이터 적재: %s", data.get("hostname", "unknown"))
PYEOF

cat > "$SRC/ap/wsgi.py" << 'PYEOF'
"""AP WSGI 엔트리포인트."""
from flask import Flask, request, jsonify

def create_app(config=None):
    app = Flask(__name__)

    @app.route("/api/agent/upload", methods=["POST"])
    def agent_upload():
        return jsonify({"status": "accepted"}), 200

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    return app

application = create_app()
PYEOF

cat > "$SRC/ap/auth.py" << 'PYEOF'
"""에이전트 인증."""
import hmac, hashlib, logging
logger = logging.getLogger("lumina.ap.auth")

class TokenAuth:
    def __init__(self, valid_token):
        self._token_hash = hashlib.sha256(valid_token.encode()).hexdigest()

    def verify(self, token):
        given = hashlib.sha256(token.encode()).hexdigest()
        return hmac.compare_digest(self._token_hash, given)
PYEOF

cat > "$SRC/ap/schema.py" << 'PYEOF'
"""에이전트 데이터 JSON 스키마."""
AGENT_UPLOAD_SCHEMA = {
    "type": "object",
    "required": ["hostname", "os_type", "collected_at"],
    "properties": {
        "hostname":     {"type": "string"},
        "os_type":      {"type": "string"},
        "os_version":   {"type": "string"},
        "collected_at": {"type": "string"},
        "interfaces":   {"type": "array"},
        "accounts":     {"type": "array"},
        "packages":     {"type": "array"},
    },
}
PYEOF

# ── WEB 서버 모듈 (스텁) ─────────────────────────────────
mkdir -p "$SRC/web/app/routes" "$SRC/web/app/templates" "$SRC/web/app/static"

cat > "$SRC/web/wsgi.py" << 'PYEOF'
"""WEB WSGI 엔트리포인트."""
from web.app import create_app
application = create_app()
PYEOF

cat > "$SRC/web/gunicorn.conf.py" << 'PYEOF'
"""Gunicorn 설정."""
import multiprocessing
bind = "127.0.0.1:8000"
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "gthread"
threads = 2
timeout = 30
graceful_timeout = 10
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
accesslog = "/var/log/blossom/lumina/web/gunicorn.log"
errorlog = "/var/log/blossom/lumina/web/gunicorn-error.log"
loglevel = "warning"
pidfile = "/run/blossom/lumina/gunicorn.pid"
forwarded_allow_ips = "127.0.0.1"
PYEOF

cat > "$SRC/web/app/__init__.py" << 'PYEOF'
"""Blossom Lumina WEB — Flask 대시보드."""
from flask import Flask

def create_app(config=None):
    app = Flask(__name__)
    app.config["DEBUG"] = False
    app.config["SESSION_COOKIE_SECURE"] = True
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    return app
PYEOF

###############################################################################
# 3) CRLF → LF 변환
###############################################################################
echo "[3/6] 줄바꿈 변환 (CRLF → LF)..."
if command -v dos2unix &>/dev/null; then
    find "$WORKDIR" -type f \( -name "*.py" -o -name "*.sh" -o -name "*.conf" \
        -o -name "*.sql" -o -name "*.service" -o -name "*.spec" -o -name "*.bash" \
        -o -name "*.env" -o -name "*.cnf" \) -exec dos2unix -q {} \;
else
    find "$WORKDIR" -type f \( -name "*.py" -o -name "*.sh" -o -name "*.conf" \
        -o -name "*.sql" -o -name "*.service" -o -name "*.spec" \) \
        -exec sed -i 's/\r$//' {} \;
fi

###############################################################################
# 4) spec 파일 복사
###############################################################################
echo "[4/6] Spec 파일 복사..."
SPECS=(
    blossom-lumina-common
    blossom-lumina-agent
    blossom-lumina-db-init
    blossom-lumina-ap
    blossom-lumina-web
)
for spec in "${SPECS[@]}"; do
    if [ -f "$DEPLOY/rpm/${spec}.spec" ]; then
        cp "$DEPLOY/rpm/${spec}.spec" "$TOPDIR/SPECS/"
        sed -i 's/\r$//' "$TOPDIR/SPECS/${spec}.spec"
        echo "  → $spec.spec"
    else
        echo "  ⚠ $spec.spec 없음 — 건너뜀"
    fi
done

###############################################################################
# 5) RPM 빌드 (순서: Common → Agent → DB-Init → AP → WEB)
###############################################################################
echo ""
echo "[5/6] RPM 빌드 시작..."
echo ""

BUILD_OK=0
BUILD_FAIL=0

for spec in "${SPECS[@]}"; do
    SPECFILE="$TOPDIR/SPECS/${spec}.spec"
    if [ ! -f "$SPECFILE" ]; then
        echo "──── 건너뜀: $spec (spec 파일 없음) ────"
        continue
    fi
    echo "──── 빌드: $spec ────"
    if rpmbuild --define "_topdir $TOPDIR" --define "dist %{nil}" -bb "$SPECFILE" 2>&1; then
        echo "  → $spec 빌드 성공 ✓"
        BUILD_OK=$((BUILD_OK + 1))
    else
        echo "  → $spec 빌드 실패 ✗"
        BUILD_FAIL=$((BUILD_FAIL + 1))
    fi
    echo ""
done

###############################################################################
# 6) 결과 출력 및 복사
###############################################################################
echo ""
echo "[6/6] 결과 정리..."

DEST="$DEPLOY/rpm/RPMS"
mkdir -p "$DEST"
find "$TOPDIR/RPMS" -name "*.rpm" -exec cp {} "$DEST/" \;

echo ""
echo "=========================================="
echo " Blossom Lumina RPM 빌드 결과"
echo "=========================================="
echo " 성공: $BUILD_OK"
echo " 실패: $BUILD_FAIL"
echo " 총계: $((BUILD_OK + BUILD_FAIL)) / ${#SPECS[@]}"
echo "=========================================="
echo ""
echo "결과물 목록 ($DEST/):"
ls -lh "$DEST/"*.rpm 2>/dev/null || echo "  (RPM 파일 없음)"
echo ""

# 임시 디렉터리 정리
rm -rf "$WORKDIR"

echo "===== 빌드 완료 ====="
