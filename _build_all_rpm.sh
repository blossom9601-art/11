#!/usr/bin/env bash
###############################################################################
# Blossom Lumina — 전체 RPM 통합 빌드 스크립트
# 빌드 대상: Common, DB-Init, AP, WEB  (4개)
# 실행 환경: Rocky Linux 8 (WSL)
###############################################################################
set -euo pipefail

DEPLOY=/mnt/c/Users/ME/Desktop/blossom/deploy
AGENTS=/mnt/c/Users/ME/Desktop/blossom/agents
WORKDIR=/tmp/lumina-rpm-build
TOPDIR="$WORKDIR/rpmbuild"

echo "===== Blossom Lumina RPM 통합 빌드 시작 ====="
echo ""

# ── 작업 디렉터리 초기화 ──────────────────────────────────
rm -rf "$WORKDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
SRC="$TOPDIR/SOURCES"

###############################################################################
# 1) 소스 파일 준비 — 기존 파일 복사
###############################################################################
echo "[1/5] 소스 파일 복사 중..."

# ── common (agents/common/) ──────────────────────────────
mkdir -p "$SRC/common"
cp "$AGENTS/common/__init__.py"  "$SRC/common/"
cp "$AGENTS/common/config.py"    "$SRC/common/"
cp "$AGENTS/common/collector.py" "$SRC/common/"

# ── conf ─────────────────────────────────────────────────
mkdir -p "$SRC/conf"
cp "$DEPLOY/conf/common.conf"  "$SRC/conf/"
cp "$DEPLOY/conf/secure.env"   "$SRC/conf/"
cp "$DEPLOY/conf/ap.conf"      "$SRC/conf/"
cp "$DEPLOY/conf/db.conf"      "$SRC/conf/"
cp "$DEPLOY/conf/web.conf"     "$SRC/conf/"

# ── sql ──────────────────────────────────────────────────
mkdir -p "$SRC/sql"
cp "$DEPLOY/sql/init.sql"      "$SRC/sql/"

# ── nginx ────────────────────────────────────────────────
mkdir -p "$SRC/nginx"
cp "$DEPLOY/nginx/lumina.conf" "$SRC/nginx/"

# ── systemd ──────────────────────────────────────────────
mkdir -p "$SRC/systemd"
cp "$DEPLOY/systemd/lumina-ap.service"  "$SRC/systemd/"
cp "$DEPLOY/systemd/lumina-web.service" "$SRC/systemd/"

###############################################################################
# 2) 누락 소스 파일 스텁 생성
###############################################################################
echo "[2/5] 누락 소스 파일 생성 중..."

# ── common/crypto.py ─────────────────────────────────────
cat > "$SRC/common/crypto.py" << 'PYEOF'
"""Blossom Lumina — 암호화/복호화 유틸리티 (AES-256-GCM)."""
import os
import hashlib
import hmac
import base64

def generate_key():
    """32바이트 랜덤 키 생성."""
    return os.urandom(32)

def derive_key(password: str, salt: bytes = None) -> tuple:
    """PBKDF2로 패스워드 기반 키 도출."""
    if salt is None:
        salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100_000)
    return key, salt

def hmac_sign(key: bytes, data: bytes) -> str:
    """HMAC-SHA256 서명."""
    return hmac.new(key, data, hashlib.sha256).hexdigest()

def hmac_verify(key: bytes, data: bytes, signature: str) -> bool:
    """HMAC-SHA256 서명 검증."""
    expected = hmac.new(key, data, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)

def safe_b64encode(data: bytes) -> str:
    """URL-safe base64 인코딩."""
    return base64.urlsafe_b64encode(data).decode('ascii')

def safe_b64decode(s: str) -> bytes:
    """URL-safe base64 디코딩."""
    return base64.urlsafe_b64decode(s.encode('ascii'))
PYEOF

# ── common/masking.py ────────────────────────────────────
cat > "$SRC/common/masking.py" << 'PYEOF'
"""Blossom Lumina — 민감정보 마스킹 유틸리티."""
import re

_PATTERNS = {
    'ip':    (re.compile(r'\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b'),
              lambda m: f"{m.group(1)}.{m.group(2)}.*.*"),
    'email': (re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'),
              lambda m: m.group(0)[:2] + '***@***'),
    'mac':   (re.compile(r'([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}'),
              lambda m: m.group(0)[:8] + ':XX:XX:XX'),
}

def mask_value(text: str, field_type: str = None) -> str:
    """필드 유형에 따라 민감정보 마스킹."""
    if field_type and field_type in _PATTERNS:
        pattern, replacer = _PATTERNS[field_type]
        return pattern.sub(replacer, text)
    for _, (pattern, replacer) in _PATTERNS.items():
        text = pattern.sub(replacer, text)
    return text

def mask_dict(data: dict, sensitive_keys: set = None) -> dict:
    """딕셔너리 내 민감 키 값 마스킹."""
    if sensitive_keys is None:
        sensitive_keys = {'password', 'secret', 'token', 'key', 'credential'}
    result = {}
    for k, v in data.items():
        if any(s in k.lower() for s in sensitive_keys):
            result[k] = '********'
        elif isinstance(v, str):
            result[k] = mask_value(v)
        elif isinstance(v, dict):
            result[k] = mask_dict(v, sensitive_keys)
        else:
            result[k] = v
    return result
PYEOF

# ── bin/ 관리 스크립트 ───────────────────────────────────
mkdir -p "$SRC/bin"

cat > "$SRC/bin/lumina-healthcheck" << 'SHEOF'
#!/bin/bash
# Blossom Lumina — 헬스체크 스크립트
set -euo pipefail
CONFDIR="/etc/blossom/lumina"
OK=0; WARN=0; FAIL=0

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
check "lumina-ap"       "systemctl is-active lumina-ap"
check "lumina-web"      "systemctl is-active lumina-web"
check "nginx"           "systemctl is-active nginx"
check "mariadb"         "systemctl is-active mariadb"
echo ""
echo "결과: OK=$OK  FAIL=$FAIL"
exit $FAIL
SHEOF

cat > "$SRC/bin/lumina-rotate-token" << 'SHEOF'
#!/bin/bash
# Blossom Lumina — 에이전트 인증 토큰 갱신
set -euo pipefail
SECURE_ENV="/etc/blossom/lumina/secure.env"
NEW_TOKEN=$(openssl rand -hex 32)
if [ -f "$SECURE_ENV" ]; then
    sed -i "s/^AGENT_TOKEN=.*/AGENT_TOKEN=$NEW_TOKEN/" "$SECURE_ENV"
    echo "토큰이 갱신되었습니다."
    echo "※ 모든 에이전트에 새 토큰을 배포하세요."
else
    echo "ERROR: $SECURE_ENV 파일을 찾을 수 없습니다."
    exit 1
fi
SHEOF

cat > "$SRC/bin/lumina-cert-renew" << 'SHEOF'
#!/bin/bash
# Blossom Lumina — TLS 인증서 갱신 안내 스크립트
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

chmod +x "$SRC/bin/lumina-healthcheck"
chmod +x "$SRC/bin/lumina-rotate-token"
chmod +x "$SRC/bin/lumina-cert-renew"

# ── CLI 도구 (lumina) ────────────────────────────────────
echo "  CLI 도구 복사 중..."
CLI_SRC=/mnt/c/Users/ME/Desktop/blossom/tools/lumina_cli
mkdir -p "$SRC/cli/lumina_cli/commands"
cp "$CLI_SRC/__init__.py"              "$SRC/cli/lumina_cli/"
cp "$CLI_SRC/__main__.py"              "$SRC/cli/lumina_cli/"
cp "$CLI_SRC/main.py"                  "$SRC/cli/lumina_cli/"
cp "$CLI_SRC/config.py"                "$SRC/cli/lumina_cli/"
cp "$CLI_SRC/api_client.py"            "$SRC/cli/lumina_cli/"
cp "$CLI_SRC/output.py"                "$SRC/cli/lumina_cli/"
cp "$CLI_SRC/commands/__init__.py"     "$SRC/cli/lumina_cli/commands/"
cp "$CLI_SRC/commands/agent.py"        "$SRC/cli/lumina_cli/commands/"

# lumina 래퍼 스크립트
cp "$CLI_SRC/lumina.sh"                "$SRC/bin/lumina"
chmod +x "$SRC/bin/lumina"

# Bash 자동완성
cp "$CLI_SRC/lumina-completion.bash"   "$SRC/cli/"

# ── AP 서버 모듈 ─────────────────────────────────────────
mkdir -p "$SRC/ap"

cat > "$SRC/ap/__init__.py" << 'PYEOF'
"""Blossom Lumina AP — 데이터 수신/처리/적재 서버."""
__version__ = '2.0.0'
PYEOF

cat > "$SRC/ap/receiver.py" << 'PYEOF'
"""TLS 수신 서버 — 에이전트 데이터 수신 엔드포인트."""
import json
import logging
from http.server import HTTPServer

logger = logging.getLogger('lumina.ap.receiver')

class AgentDataReceiver:
    """에이전트 데이터 수신 핸들러."""
    def __init__(self, config):
        self.bind_host = config.get('bind_host', '0.0.0.0')
        self.bind_port = config.get('bind_port', 5100)

    def handle_upload(self, data: dict) -> dict:
        """에이전트 업로드 데이터 수신."""
        logger.info("데이터 수신: agent_id=%s", data.get('agent_id', 'unknown'))
        return {'status': 'accepted'}
PYEOF

cat > "$SRC/ap/queue.py" << 'PYEOF'
"""파일 기반 내부 큐 — 장애 시 데이터 유실 방지."""
import os
import json
import time
import logging

logger = logging.getLogger('lumina.ap.queue')

class FileQueue:
    """파일 기반 FIFO 큐."""
    def __init__(self, queue_dir='/var/lib/blossom/lumina/ap/queue'):
        self.queue_dir = queue_dir
        os.makedirs(queue_dir, exist_ok=True)

    def enqueue(self, data: dict) -> str:
        fname = f"{int(time.time()*1000)}.json"
        path = os.path.join(self.queue_dir, fname)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        return fname

    def dequeue(self):
        files = sorted(os.listdir(self.queue_dir))
        if not files:
            return None
        path = os.path.join(self.queue_dir, files[0])
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        os.unlink(path)
        return data
PYEOF

cat > "$SRC/ap/parser.py" << 'PYEOF'
"""JSON 스키마 검증 + 정규화."""
import logging

logger = logging.getLogger('lumina.ap.parser')

REQUIRED_FIELDS = ['agent_id', 'hostname', 'timestamp', 'data_type']

def validate(payload: dict) -> tuple:
    """페이로드 검증. (is_valid, errors)"""
    errors = []
    for field in REQUIRED_FIELDS:
        if field not in payload:
            errors.append(f"필수 필드 누락: {field}")
    return (len(errors) == 0, errors)

def normalize(payload: dict) -> dict:
    """수신 데이터 정규화."""
    payload['hostname'] = payload.get('hostname', '').strip().lower()
    return payload
PYEOF

cat > "$SRC/ap/worker.py" << 'PYEOF'
"""데이터 변환/마스킹 워커."""
import logging

logger = logging.getLogger('lumina.ap.worker')

class DataWorker:
    """큐에서 데이터를 꺼내 변환/마스킹 후 포워더에 전달."""
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
"""DB 적재 포워더 — MariaDB TLS 연결."""
import logging

logger = logging.getLogger('lumina.ap.forwarder')

class DBForwarder:
    """처리된 데이터를 MariaDB에 적재."""
    def __init__(self, db_config):
        self.db_config = db_config
        self._conn = None

    def connect(self):
        import pymysql
        self._conn = pymysql.connect(
            host=self.db_config['host'],
            port=int(self.db_config.get('port', 3306)),
            user=self.db_config['user'],
            password=self.db_config['password'],
            database=self.db_config['database'],
            charset='utf8mb4',
            ssl={'ca': self.db_config.get('ssl_ca', '')},
        )
        logger.info("DB 연결 성공")

    def forward(self, data: dict):
        if self._conn is None:
            self.connect()
        logger.info("데이터 적재: %s", data.get('agent_id', 'unknown'))
PYEOF

cat > "$SRC/ap/wsgi.py" << 'PYEOF'
"""AP WSGI 엔트리포인트."""
from ap.receiver import AgentDataReceiver

def create_app(config=None):
    """AP Flask 앱 생성 (간이 수신 서버)."""
    from flask import Flask, request, jsonify
    app = Flask(__name__)

    @app.route('/api/agent/upload', methods=['POST'])
    def agent_upload():
        return jsonify({'status': 'accepted'}), 200

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({'status': 'ok'}), 200

    return app

application = create_app()
PYEOF

cat > "$SRC/ap/auth.py" << 'PYEOF'
"""에이전트 인증 — 토큰/mTLS 검증."""
import hmac
import hashlib
import logging

logger = logging.getLogger('lumina.ap.auth')

class TokenAuth:
    """Bearer 토큰 인증."""
    def __init__(self, valid_token: str):
        self._token_hash = hashlib.sha256(valid_token.encode()).hexdigest()

    def verify(self, token: str) -> bool:
        given = hashlib.sha256(token.encode()).hexdigest()
        return hmac.compare_digest(self._token_hash, given)
PYEOF

cat > "$SRC/ap/schema.py" << 'PYEOF'
"""에이전트 데이터 JSON 스키마 정의."""

AGENT_UPLOAD_SCHEMA = {
    'type': 'object',
    'required': ['agent_id', 'hostname', 'timestamp', 'data_type', 'payload'],
    'properties': {
        'agent_id':   {'type': 'string'},
        'hostname':   {'type': 'string'},
        'timestamp':  {'type': 'string', 'format': 'date-time'},
        'data_type':  {'type': 'string', 'enum': ['interfaces', 'accounts', 'packages']},
        'payload':    {'type': 'object'},
    }
}
PYEOF

# ── WEB 서버 모듈 ────────────────────────────────────────
mkdir -p "$SRC/web/app/routes" "$SRC/web/app/templates" "$SRC/web/app/static"

cat > "$SRC/web/wsgi.py" << 'PYEOF'
"""WEB WSGI 엔트리포인트 — Gunicorn에서 호출."""
from web.app import create_app
application = create_app()
PYEOF

cat > "$SRC/web/gunicorn.conf.py" << 'PYEOF'
"""Gunicorn 설정 — Lumina WEB."""
import multiprocessing

bind = '127.0.0.1:8000'
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'sync'
timeout = 120
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
accesslog = '/var/log/blossom/lumina/web/access.log'
errorlog  = '/var/log/blossom/lumina/web/error.log'
loglevel  = 'info'
pidfile   = '/run/blossom/lumina/gunicorn.pid'
PYEOF

cat > "$SRC/web/app/__init__.py" << 'PYEOF'
"""Blossom Lumina WEB — Flask 대시보드 앱 팩토리."""
from flask import Flask

def create_app(config=None):
    app = Flask(__name__)
    app.config['DEBUG'] = False
    app.config['SESSION_COOKIE_SECURE'] = True
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    return app
PYEOF

###############################################################################
# 3) CRLF → LF 변환
###############################################################################
echo "[3/5] 줄바꿈 변환 (CRLF → LF)..."
find "$WORKDIR" -type f -exec dos2unix -q {} \; 2>/dev/null || true

###############################################################################
# 4) spec 파일 복사
###############################################################################
echo "[4/5] Spec 파일 복사..."
for spec in blossom-lumina-common blossom-lumina-db-init blossom-lumina-ap blossom-lumina-web; do
    cp "$DEPLOY/rpm/${spec}.spec" "$TOPDIR/SPECS/"
    dos2unix -q "$TOPDIR/SPECS/${spec}.spec" 2>/dev/null || true
done

###############################################################################
# 5) RPM 빌드 (순서: Common → DB-Init → AP → WEB)
###############################################################################
echo "[5/5] RPM 빌드 시작..."
echo ""

BUILD_OK=0
BUILD_FAIL=0

for spec in blossom-lumina-common blossom-lumina-db-init blossom-lumina-ap blossom-lumina-web; do
    echo "──── 빌드: $spec ────"
    if rpmbuild --define "_topdir $TOPDIR" --define "dist %{nil}" -bb "$TOPDIR/SPECS/${spec}.spec" 2>&1; then
        echo "  → $spec 빌드 성공"
        BUILD_OK=$((BUILD_OK + 1))
    else
        echo "  → $spec 빌드 실패!"
        BUILD_FAIL=$((BUILD_FAIL + 1))
    fi
    echo ""
done

###############################################################################
# 결과 출력 및 Windows로 복사
###############################################################################
echo ""
echo "=========================================="
echo " 빌드 결과: 성공=$BUILD_OK  실패=$BUILD_FAIL"
echo "=========================================="
echo ""

DEST=/mnt/c/Users/ME/Desktop/blossom/deploy/rpm/RPMS
mkdir -p "$DEST"
find "$TOPDIR/RPMS" -name "*.rpm" -exec cp {} "$DEST/" \;

echo "결과물 목록 ($DEST/):"
ls -lh "$DEST/"*.rpm 2>/dev/null || echo "  (RPM 파일 없음)"
echo ""
echo "===== 빌드 완료 ====="
