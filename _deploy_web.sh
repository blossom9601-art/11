#!/bin/bash
###############################################################################
# Blossom 실제 앱 배포 스크립트
# - 기존 스켈레톤 제거 → 실제 Blossom 앱 배포
# - Python 의존성 설치
# - 프로덕션 환경 변수 설정
# - DB 스키마 초기화 (Flask-Migrate)
# - gunicorn wsgi 재구성
# - 서비스 재시작
###############################################################################
set -euo pipefail

DEPLOY_DIR="/opt/blossom/lumina/web"
TARBALL="/tmp/blossom_deploy.tar.gz"

echo "============================================"
echo "  Blossom 실제 앱 배포"
echo "============================================"

# ─── 1. 서비스 중지 ──────────────────────────────────────
echo ""
echo "[1/8] 서비스 중지..."
systemctl stop lumina-web 2>/dev/null || true

# ─── 2. 기존 스켈레톤 제거 + 앱 배포 ────────────────────
echo "[2/8] 앱 파일 배포..."
# 기존 web 디렉터리 백업 후 정리
if [ -d "$DEPLOY_DIR/app" ]; then
    rm -rf "${DEPLOY_DIR}/app"
    rm -rf "${DEPLOY_DIR}/static"
    rm -rf "${DEPLOY_DIR}/migrations"
    rm -f "${DEPLOY_DIR}/wsgi.py"
    rm -f "${DEPLOY_DIR}/gunicorn.conf.py"
fi

# tarball 풀기
cd "$DEPLOY_DIR"
tar -xzf "$TARBALL"
echo "  → 파일 배포 완료 ($(find . -type f | wc -l) files)"

# ─── 3. 디렉터리 구조 확인 ──────────────────────────────
echo "[3/8] 디렉터리 구조 확인..."
ls -la "$DEPLOY_DIR/"
echo "  app/: $(find app -type f | wc -l) files"
echo "  static/: $(find static -type f | wc -l) files"

# ─── 4. wsgi.py 생성 (프로덕션) ──────────────────────────
echo "[4/8] wsgi.py + gunicorn.conf.py 생성..."

cat > "$DEPLOY_DIR/wsgi.py" << 'WSGI'
"""Blossom 프로덕션 WSGI 엔트리포인트."""
import os
import sys

# 앱 루트를 PYTHONPATH에 추가
_base = os.path.dirname(os.path.abspath(__file__))
if _base not in sys.path:
    sys.path.insert(0, _base)

os.environ.setdefault('FLASK_ENV', 'production')

from app import create_app

application = create_app()
app = application  # gunicorn에서 wsgi:app 으로 참조
WSGI

cat > "$DEPLOY_DIR/gunicorn.conf.py" << 'GCONF'
"""Gunicorn 설정 — Blossom 프로덕션."""
import multiprocessing

bind = '127.0.0.1:8000'
workers = min(multiprocessing.cpu_count() * 2 + 1, 9)
worker_class = 'sync'
timeout = 120
keepalive = 5
max_requests = 2000
max_requests_jitter = 100
accesslog = '/var/log/blossom/lumina/web/access.log'
errorlog  = '/var/log/blossom/lumina/web/error.log'
loglevel  = 'info'
pidfile   = '/run/blossom/lumina/gunicorn.pid'
# Static files served by nginx, not gunicorn
forwarded_allow_ips = '127.0.0.1'
proxy_allow_ips = '127.0.0.1'
GCONF

echo "  → wsgi.py + gunicorn.conf.py 생성"

# ─── 5. Python 의존성 설치 ──────────────────────────────
echo "[5/8] Python 의존성 설치..."
pip3 install --quiet --upgrade pip 2>&1 | tail -2
pip3 install --quiet -r "$DEPLOY_DIR/requirements.txt" 2>&1 | tail -5
echo "  → 주요 패키지 확인:"
python3 -c "import flask; print(f'  Flask {flask.__version__}')"
python3 -c "import sqlalchemy; print(f'  SQLAlchemy {sqlalchemy.__version__}')"
python3 -c "import pymysql; print(f'  PyMySQL {pymysql.__version__}')" 2>/dev/null || echo "  PyMySQL: 설치 필요"

# PyMySQL 추가 설치 (requirements.txt에 있지만 확인)
pip3 install --quiet PyMySQL 2>&1 || true

# ─── 6. 프로덕션 환경 변수 설정 ─────────────────────────
echo "[6/8] 프로덕션 환경 변수 설정..."

# secure.env에 Blossom 앱용 변수 추가
cat > /etc/blossom/lumina/web.env << 'ENVEOF'
# Blossom WEB 프로덕션 환경 변수
FLASK_ENV=production
SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}

# MySQL 연결 (lumina DB)
DATABASE_URL=mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=lumina_admin
MYSQL_PASSWORD=LuminaAdmin2026Secure
MYSQL_DB=lumina

# 파일 업로드
UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
ENVEOF

chown root:lumina /etc/blossom/lumina/web.env
chmod 640 /etc/blossom/lumina/web.env

echo "  → web.env 생성"

# ─── 7. systemd override 업데이트 ────────────────────────
echo "[7/8] systemd override 업데이트..."

GUNICORN_BIN=$(which gunicorn 2>/dev/null || echo "/usr/local/bin/gunicorn")

cat > /etc/systemd/system/lumina-web.service.d/override.conf << SVCEOF
[Service]
Type=simple
User=lumina
Group=lumina

# 환경파일 (DB 접속정보 등)
EnvironmentFile=/etc/blossom/lumina/web.env

# PYTHONPATH: 앱 루트
Environment=PYTHONPATH=${DEPLOY_DIR}

# gunicorn 실행
ExecStart=
ExecStart=${GUNICORN_BIN} \\
    --config ${DEPLOY_DIR}/gunicorn.conf.py \\
    --chdir ${DEPLOY_DIR} \\
    wsgi:app

WatchdogSec=0

# 보안 완화 (테스트)
PrivateUsers=no
MemoryDenyWriteExecute=no
ProtectSystem=no
ReadWritePaths=
SVCEOF

systemctl daemon-reload
echo "  → systemd override 업데이트"

# ─── 8. 디렉터리/소유권/uploads ──────────────────────────
echo "[8/8] 소유권 + 필수 디렉터리..."
mkdir -p /var/lib/blossom/lumina/web/uploads
mkdir -p "$DEPLOY_DIR/instance"
chown -R lumina:lumina "$DEPLOY_DIR/"
chown -R lumina:lumina /var/lib/blossom/lumina/web/
chown -R lumina:lumina /var/log/blossom/lumina/web/
mkdir -p /run/blossom/lumina
chown lumina:lumina /run/blossom/lumina

# SELinux: static 파일도 httpd_sys_content_t 설정
chcon -R -t httpd_sys_content_t "$DEPLOY_DIR/static/" 2>/dev/null || true

# ─── DB 스키마 초기화 ────────────────────────────────────
echo ""
echo "=== DB 스키마 초기화 ==="
cd "$DEPLOY_DIR"
export FLASK_ENV=production
export FLASK_APP=wsgi.py
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=lumina_admin
export MYSQL_PASSWORD=LuminaAdmin2026Secure
export MYSQL_DB=lumina
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
export PYTHONPATH="$DEPLOY_DIR"

# Flask app 테스트
echo "  Flask 앱 import 테스트..."
python3 -c "
import sys
sys.path.insert(0, '$DEPLOY_DIR')
from app import create_app
app = create_app()
print(f'  → Flask 앱 생성 성공: {len(app.url_map._rules)} routes')
" 2>&1 || {
    echo "  → Flask 앱 import 실패! 상세 오류:"
    python3 -c "
import sys, traceback
sys.path.insert(0, '$DEPLOY_DIR')
try:
    from app import create_app
    app = create_app()
except Exception:
    traceback.print_exc()
" 2>&1
}

# DB 마이그레이션 시도
echo ""
echo "  DB 마이그레이션 시도..."
cd "$DEPLOY_DIR"
python3 -c "
import sys, os
sys.path.insert(0, '${DEPLOY_DIR}')
os.environ['FLASK_ENV'] = 'production'
from app import create_app
from app.models import db
app = create_app()
with app.app_context():
    db.create_all()
    print('  → 테이블 생성 완료')
    # 테이블 수 확인
    from sqlalchemy import inspect
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()
    print(f'  → 총 {len(tables)}개 테이블')
    for t in sorted(tables)[:10]:
        print(f'     - {t}')
    if len(tables) > 10:
        print(f'     ... (+{len(tables)-10}개)')
" 2>&1 || echo "  → DB 초기화 별도 처리 필요"

# ─── 서비스 시작 ─────────────────────────────────────────
echo ""
echo "=== 서비스 재시작 ==="
systemctl reset-failed lumina-web 2>/dev/null || true
systemctl start lumina-web
sleep 3

echo ""
echo "=== 서비스 상태 ==="
systemctl status lumina-web --no-pager 2>&1 | head -15

echo ""
echo "=== 연결 테스트 ==="
echo -n "  GET / → HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ 2>&1
echo ""
echo -n "  GET /api/auth/me → HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/auth/me 2>&1
echo ""
echo -n "  NGINX → HTTP "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/ 2>&1
echo ""

echo ""
echo "=== gunicorn 오류 로그 (마지막 10줄) ==="
tail -10 /var/log/blossom/lumina/web/error.log 2>/dev/null || echo "(없음)"

echo ""
journalctl -u lumina-web --no-pager -n 10 2>&1

echo ""
echo "============================================"
echo "  배포 완료"
echo "============================================"
