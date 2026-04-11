#!/bin/bash
###############################################################################
# Blossom 앱 최종 배포 — 환경설정 + 서비스 기동
###############################################################################
set -euo pipefail

DEPLOY_DIR="/opt/blossom/lumina/web"
GUNICORN_BIN="/usr/local/bin/gunicorn"

echo "=== 소유권 설정 ==="
chown -R lumina:lumina "$DEPLOY_DIR/"
chown -R lumina:lumina /var/lib/blossom/lumina/web/
chown -R lumina:lumina /var/log/blossom/lumina/web/

# wsgi.py 생성
cat > "$DEPLOY_DIR/wsgi.py" << 'WSGI'
"""Blossom 프로덕션 WSGI 엔트리포인트."""
import os, sys
_base = os.path.dirname(os.path.abspath(__file__))
if _base not in sys.path:
    sys.path.insert(0, _base)
os.environ.setdefault('FLASK_ENV', 'production')
from app import create_app
application = create_app()
app = application
WSGI

# gunicorn.conf.py 생성
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
forwarded_allow_ips = '127.0.0.1'
GCONF

# instance 디렉터리 (SQLite auxiliary DBs 등)
mkdir -p "$DEPLOY_DIR/instance"
mkdir -p /var/lib/blossom/lumina/web/uploads
chown -R lumina:lumina "$DEPLOY_DIR/"

echo "=== web.env 설정 ==="
cat > /etc/blossom/lumina/web.env << 'ENVEOF'
FLASK_ENV=production
SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
DATABASE_URL=mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=lumina_admin
MYSQL_PASSWORD=LuminaAdmin2026Secure
MYSQL_DB=lumina
UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
ENVEOF
chown root:lumina /etc/blossom/lumina/web.env
chmod 640 /etc/blossom/lumina/web.env

echo "=== systemd override ==="
cat > /etc/systemd/system/lumina-web.service.d/override.conf << SVCEOF
[Service]
Type=simple
User=lumina
Group=lumina
EnvironmentFile=/etc/blossom/lumina/web.env
Environment=PYTHONPATH=${DEPLOY_DIR}
ExecStart=
ExecStart=${GUNICORN_BIN} \\
    --config ${DEPLOY_DIR}/gunicorn.conf.py \\
    --chdir ${DEPLOY_DIR} \\
    wsgi:app
WatchdogSec=0
PrivateUsers=no
MemoryDenyWriteExecute=no
ProtectSystem=no
ReadWritePaths=
SVCEOF
systemctl daemon-reload

echo "=== Flask 앱 테스트 ==="
cd "$DEPLOY_DIR"
export FLASK_ENV=production
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=lumina_admin
export MYSQL_PASSWORD=LuminaAdmin2026Secure
export MYSQL_DB=lumina
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
export PYTHONPATH="$DEPLOY_DIR"

python3.9 -c "
import sys
sys.path.insert(0, '$DEPLOY_DIR')
from app import create_app
app = create_app()
print(f'Flask 앱: {len(app.url_map._rules)} routes')
for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule)[:20]:
    print(f'  {rule.rule} [{",".join(rule.methods - {\"HEAD\",\"OPTIONS\"})}]')
print('  ...')
" 2>&1 || {
    echo "Flask 앱 import 실패! 오류 상세:"
    python3.9 -c "
import sys, traceback
sys.path.insert(0, '$DEPLOY_DIR')
try:
    from app import create_app
    app = create_app()
except Exception:
    traceback.print_exc()
" 2>&1
}

echo ""
echo "=== DB 테이블 초기화 ==="
python3.9 -c "
import sys, os
sys.path.insert(0, '${DEPLOY_DIR}')
os.environ['FLASK_ENV'] = 'production'
from app import create_app
from app.models import db
app = create_app()
with app.app_context():
    db.create_all()
    from sqlalchemy import inspect
    tables = inspect(db.engine).get_table_names()
    print(f'총 {len(tables)}개 테이블 생성')
" 2>&1

echo ""
echo "=== 서비스 시작 ==="
mkdir -p /run/blossom/lumina
chown lumina:lumina /run/blossom/lumina
systemctl reset-failed lumina-web 2>/dev/null || true
systemctl restart lumina-web
sleep 4

echo ""
echo "=== 서비스 상태 ==="
systemctl status lumina-web --no-pager 2>&1 | head -15

echo ""
echo "=== 연결 테스트 ==="
echo -n "  GET / → HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/
echo ""
echo -n "  NGINX / → HTTP "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/
echo ""
echo -n "  GET /login → HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/login
echo ""

echo ""
echo "  HTML 확인 (첫 5줄):"
curl -s --max-time 5 http://127.0.0.1:8000/ 2>&1 | head -5

echo ""
echo "=== gunicorn 오류 (최근 10줄) ==="
tail -10 /var/log/blossom/lumina/web/error.log 2>/dev/null || echo "(없음)"

echo ""
echo "완료"
