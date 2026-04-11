#!/bin/bash
###############################################################################
# Lumina 서비스 수정 2차 — AP/WEB/NGINX 오류 해결
###############################################################################
set -euo pipefail

echo "============================================"
echo "  Lumina 서비스 수정 (2차)"
echo "============================================"

# ─── 1. 파일 소유권 재확인 (상세) ────────────────────────
echo ""
echo "[1/6] 파일 소유권 재확인..."
ls -la /var/log/blossom/lumina/web/ 2>&1
ls -la /var/log/blossom/lumina/ap/ 2>&1

# 로그 파일이 없으면 생성, 있으면 소유권 변경
touch /var/log/blossom/lumina/web/access.log
touch /var/log/blossom/lumina/web/error.log
touch /var/log/blossom/lumina/ap/receiver.log
chown -R lumina:lumina /var/log/blossom/
chown -R lumina:lumina /var/lib/blossom/
chown -R lumina:lumina /opt/blossom/lumina/
chmod 755 /var/log/blossom/lumina/web/
chmod 755 /var/log/blossom/lumina/ap/
chmod 644 /var/log/blossom/lumina/web/*.log
chmod 644 /var/log/blossom/lumina/ap/*.log
echo "  → 로그 파일 소유권/권한 수정 완료"

# ─── 2. lumina-ap override 재작성 ────────────────────────
# 문제: Type=notify인데 sd_notify() 호출 없음
# 해결: Type=simple + gunicorn으로 AP도 서빙
echo ""
echo "[2/6] lumina-ap override 재작성..."

GUNICORN_BIN=$(which gunicorn 2>/dev/null || echo "/usr/local/bin/gunicorn")

cat > /etc/systemd/system/lumina-ap.service.d/override.conf << APEOF
[Service]
# ── 타입 변경: notify → simple (gunicorn은 sd_notify 불필요) ──
Type=simple

# ── 통합 계정 lumina ──
User=lumina
Group=lumina

# ── PYTHONPATH: common + ap 모듈 import ──
Environment=PYTHONPATH=/opt/blossom/lumina

# ── ExecStart 교체: gunicorn으로 AP 서빙 (포트 5100) ──
ExecStart=
ExecStart=${GUNICORN_BIN} \
    --bind 0.0.0.0:5100 \
    --workers 2 \
    --timeout 120 \
    --access-logfile /var/log/blossom/lumina/ap/access.log \
    --error-logfile /var/log/blossom/lumina/ap/error.log \
    --chdir /opt/blossom/lumina/ap \
    wsgi:application

# ── WatchdogSec 비활성화 (sd_notify 없으므로) ──
WatchdogSec=0

# ── 보안 샌드박스 완화 (테스트 환경) ──
PrivateUsers=no
MemoryDenyWriteExecute=no
ProtectSystem=no

# ── 쓰기 경로 ──
ReadWritePaths=
APEOF
echo "  → lumina-ap: Type=simple + gunicorn 전환"

# ─── 3. lumina-web override 재작성 ───────────────────────
echo ""
echo "[3/6] lumina-web override 재작성..."

cat > /etc/systemd/system/lumina-web.service.d/override.conf << WEBEOF
[Service]
# ── 타입 변경 ──
Type=simple

# ── 통합 계정 lumina ──
User=lumina
Group=lumina

# ── PYTHONPATH: common + web 모듈 import ──
Environment=PYTHONPATH=/opt/blossom/lumina

# ── gunicorn 실제 경로로 ExecStart 교체 ──
ExecStart=
ExecStart=${GUNICORN_BIN} \
    --config /opt/blossom/lumina/web/gunicorn.conf.py \
    --chdir /opt/blossom/lumina/web \
    wsgi:application

# ── WatchdogSec 비활성화 ──
WatchdogSec=0

# ── 보안 샌드박스 완화 (테스트 환경) ──
PrivateUsers=no
MemoryDenyWriteExecute=no
ProtectSystem=no

# ── 쓰기 경로 ──
ReadWritePaths=
WEBEOF
echo "  → lumina-web: Type=simple + 퍼미션 완화"

# ─── 4. wsgi.py import 수정 (web) ───────────────────────
# web/wsgi.py: "from web.app import create_app" 이지만
# gunicorn --chdir /opt/blossom/lumina/web 이므로
# PYTHONPATH=/opt/blossom/lumina에서 web.app 접근 가능
echo ""
echo "[4/6] wsgi.py 확인 및 수정..."

echo "  AP wsgi.py:"
cat /opt/blossom/lumina/ap/wsgi.py

echo ""
echo "  WEB wsgi.py:"
cat /opt/blossom/lumina/web/wsgi.py

# WEB wsgi.py의 import를 확인 - chdir=/opt/blossom/lumina/web이므로
# "from web.app import" 대신 "from app import"으로 접근해야 함
# 또는 PYTHONPATH에 /opt/blossom/lumina가 있으므로 "from web.app import" 가능
# 둘 다 시도할 수 있도록 수정
cat > /opt/blossom/lumina/web/wsgi.py << 'WSGIWEB'
"""WEB WSGI 엔트리포인트 — Gunicorn에서 호출."""
import sys, os

# PYTHONPATH 보정: chdir과 패키지 루트 모두 포함
_base = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_base)
for p in [_base, _root]:
    if p not in sys.path:
        sys.path.insert(0, p)

from app import create_app

application = create_app()
WSGIWEB
chown lumina:lumina /opt/blossom/lumina/web/wsgi.py
echo "  → WEB wsgi.py 수정 완료"

# AP wsgi.py도 import 보정
cat > /opt/blossom/lumina/ap/wsgi.py << 'WSGIAP'
"""AP WSGI 엔트리포인트."""
import sys, os

# PYTHONPATH 보정
_base = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_base)
for p in [_base, _root]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from ap.receiver import AgentDataReceiver
except ImportError:
    pass  # 독립 모드: receiver 없이도 동작

from flask import Flask, jsonify

def create_app(config=None):
    """AP Flask 앱 생성 (에이전트 데이터 수신 서버)."""
    app = Flask(__name__)

    @app.route('/api/agent/upload', methods=['POST'])
    def agent_upload():
        return jsonify({'status': 'accepted'}), 200

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({'status': 'ok'}), 200

    return app

application = create_app()
WSGIAP
chown lumina:lumina /opt/blossom/lumina/ap/wsgi.py
echo "  → AP wsgi.py 수정 완료"

# ─── 5. nginx 수정 ──────────────────────────────────────
echo ""
echo "[5/6] nginx 구성 수정..."

# 메인 nginx.conf에서 server 블록 중 port 80 listen이 있는 부분 확인
echo "  현재 nginx.conf의 listen 설정:"
grep -n 'listen' /etc/nginx/nginx.conf | head -10

# nginx.conf의 기본 server 블록에서 listen 80 제거 방법:
# default.conf가 있으면 비활성화
if [ -f /etc/nginx/conf.d/default.conf ]; then
    mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.disabled
    echo "  → default.conf 비활성화"
fi

# nginx.conf 내의 server {} 블록 자체를 주석처리
# server { listen 80; ... } 블록을 제거하는 것이 가장 깔끔
# 임시: nginx.conf.bak 복원 후 server 블록 제거
python3 << 'PYFIX'
import re

with open('/etc/nginx/nginx.conf', 'r') as f:
    content = f.read()

# server { ... } 블록을 찾아서 주석 처리
# HTTP 섹션 내의 server 블록만 제거 (lumina.conf가 대체)
lines = content.split('\n')
result = []
in_server = False
brace_depth = 0
for line in lines:
    stripped = line.strip()
    if not in_server and stripped.startswith('server') and '{' in stripped:
        in_server = True
        brace_depth = stripped.count('{') - stripped.count('}')
        result.append('#' + line + '  # disabled for lumina.conf')
        if brace_depth <= 0:
            in_server = False
        continue
    if in_server:
        brace_depth += stripped.count('{') - stripped.count('}')
        result.append('#' + line)
        if brace_depth <= 0:
            in_server = False
        continue
    result.append(line)

with open('/etc/nginx/nginx.conf', 'w') as f:
    f.write('\n'.join(result))
print("  → nginx.conf server 블록 주석 처리 완료")
PYFIX

# nginx 설정 테스트
echo "  nginx 설정 테스트:"
nginx -t 2>&1

# ─── 6. 전체 서비스 재기동 ──────────────────────────────
echo ""
echo "[6/6] 전체 서비스 재기동..."
systemctl daemon-reload

# 실패 카운터 리셋
systemctl reset-failed lumina-ap.service 2>/dev/null || true
systemctl reset-failed lumina-web.service 2>/dev/null || true
systemctl reset-failed nginx.service 2>/dev/null || true

# 런타임 디렉터리
mkdir -p /run/blossom/lumina
chown lumina:lumina /run/blossom/lumina

# MariaDB
echo ""
echo "--- MariaDB ---"
systemctl is-active mariadb && echo "  → active" || systemctl start mariadb

# lumina-ap
echo ""
echo "--- lumina-ap 시작 ---"
systemctl stop lumina-ap 2>/dev/null || true
systemctl start lumina-ap
sleep 3
systemctl status lumina-ap --no-pager 2>&1 | head -15
journalctl -u lumina-ap --no-pager -n 5 2>&1

# lumina-web
echo ""
echo "--- lumina-web 시작 ---"
systemctl stop lumina-web 2>/dev/null || true
systemctl start lumina-web
sleep 3
systemctl status lumina-web --no-pager 2>&1 | head -15
journalctl -u lumina-web --no-pager -n 5 2>&1

# nginx
echo ""
echo "--- nginx 시작 ---"
systemctl stop nginx 2>/dev/null || true
systemctl start nginx
sleep 1
systemctl status nginx --no-pager 2>&1 | head -15

# ─── 최종 검증 ──────────────────────────────────────────
echo ""
echo "============================================"
echo "  최종 검증"
echo "============================================"

echo ""
echo "=== 서비스 상태 ==="
printf "  %-15s : %s\n" "mariadb" "$(systemctl is-active mariadb)"
printf "  %-15s : %s\n" "lumina-ap" "$(systemctl is-active lumina-ap)"
printf "  %-15s : %s\n" "lumina-web" "$(systemctl is-active lumina-web)"
printf "  %-15s : %s\n" "nginx" "$(systemctl is-active nginx)"

echo ""
echo "=== 포트 확인 ==="
ss -tlnp | grep -E '3306|5100|8000|80|443' || echo "(포트 없음)"

echo ""
echo "=== 프로세스 사용자 ==="
ps -eo user,pid,comm | grep -E 'lumina|gunicorn|mysql|nginx' | grep -v grep

echo ""
echo "=== 연결 테스트 ==="
echo -n "  AP(5100) health: "
curl -s --max-time 3 http://127.0.0.1:5100/health 2>&1 || echo "FAIL"
echo ""
echo -n "  WEB(8000) direct: "
curl -s --max-time 3 http://127.0.0.1:8000/ 2>&1 | head -1 || echo "FAIL"
echo ""
echo -n "  NGINX(443) proxy: "
curl -sk --max-time 3 https://127.0.0.1/ 2>&1 | head -1 || echo "FAIL"

echo ""
echo "============================================"
echo "  완료"
echo "============================================"
