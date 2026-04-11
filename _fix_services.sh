#!/bin/bash
###############################################################################
# Lumina 전체 서비스 수정 및 기동 스크립트
# - lumina 통합 계정 생성
# - systemd 서비스 override (User/Group, PYTHONPATH, gunicorn 경로)
# - nginx 중복 default_server 수정
# - 파일 소유권 변경
# - 서비스 기동 및 검증
###############################################################################
set -euo pipefail

echo "============================================"
echo "  Lumina 서비스 수정 스크립트"
echo "============================================"

# ─── 1. lumina 통합 계정 생성 ─────────────────────────────
echo ""
echo "[1/8] lumina 통합 계정 생성..."
if id lumina &>/dev/null; then
    echo "  → lumina 계정 이미 존재"
else
    # 그룹이 이미 존재할 수 있으므로 -g 지정
    getent group lumina &>/dev/null || groupadd --system lumina
    useradd --system --shell /sbin/nologin \
            --home-dir /opt/blossom/lumina \
            --gid lumina \
            --comment "Blossom Lumina Service Account" \
            lumina
    echo "  → lumina 계정 생성 완료"
fi
id lumina

# ─── 2. 디렉터리 소유권 변경 ─────────────────────────────
echo ""
echo "[2/8] 디렉터리 소유권 lumina:lumina 변경..."
chown -R lumina:lumina /opt/blossom/lumina/
chown -R lumina:lumina /var/lib/blossom/lumina/
chown -R lumina:lumina /var/log/blossom/lumina/
# 설정 파일은 root 소유 + lumina 읽기
chown root:lumina /etc/blossom/lumina/*.conf 2>/dev/null || true
chmod 640 /etc/blossom/lumina/*.conf 2>/dev/null || true
chown root:lumina /etc/blossom/lumina/secure.env
chmod 640 /etc/blossom/lumina/secure.env
# TLS 키는 lumina만 읽기
chown root:lumina /etc/blossom/lumina/tls/server.key
chmod 640 /etc/blossom/lumina/tls/server.key
echo "  → 소유권 변경 완료"

# ─── 3. 필요 Python 패키지 확인/설치 ────────────────────
echo ""
echo "[3/8] Python 패키지 확인..."
pip3 install --quiet flask gunicorn 2>&1 || true
echo "  gunicorn: $(which gunicorn 2>/dev/null || echo 'NOT FOUND')"
echo "  flask: $(python3 -c 'import flask; print(flask.__version__)' 2>/dev/null || echo 'NOT FOUND')"

# ─── 4. lumina-ap systemd override ──────────────────────
echo ""
echo "[4/8] lumina-ap systemd override 생성..."
mkdir -p /etc/systemd/system/lumina-ap.service.d
cat > /etc/systemd/system/lumina-ap.service.d/override.conf << 'APEOF'
[Service]
# ── 통합 계정 lumina ──
User=lumina
Group=lumina

# ── PYTHONPATH: common + ap 모듈 import를 위해 ──
Environment=PYTHONPATH=/opt/blossom/lumina

# ── 보안 샌드박스 일시 완화 (테스트 환경) ──
PrivateUsers=no
MemoryDenyWriteExecute=no
ProtectSystem=full

# ── 로그/데이터 경로 쓰기 허용 재지정 ──
ReadWritePaths=/var/lib/blossom/lumina/ap
ReadWritePaths=/var/log/blossom/lumina/ap
ReadWritePaths=/run/blossom/lumina
APEOF
echo "  → lumina-ap override 완료"

# ─── 5. lumina-web systemd override ─────────────────────
echo ""
echo "[5/8] lumina-web systemd override 생성..."
mkdir -p /etc/systemd/system/lumina-web.service.d

# gunicorn 실제 경로 탐지
GUNICORN_BIN=$(which gunicorn 2>/dev/null || echo "/usr/local/bin/gunicorn")
echo "  → gunicorn 경로: $GUNICORN_BIN"

cat > /etc/systemd/system/lumina-web.service.d/override.conf << WEBEOF
[Service]
# ── 통합 계정 lumina ──
User=lumina
Group=lumina

# ── PYTHONPATH: common + web 모듈 import를 위해 ──
Environment=PYTHONPATH=/opt/blossom/lumina

# ── gunicorn 실제 경로로 ExecStart 교체 ──
ExecStart=
ExecStart=${GUNICORN_BIN} \\
    --config /opt/blossom/lumina/web/gunicorn.conf.py \\
    --chdir /opt/blossom/lumina/web \\
    wsgi:app

# ── 보안 샌드박스 일시 완화 (테스트 환경) ──
PrivateUsers=no
MemoryDenyWriteExecute=no
ProtectSystem=full

# ── 로그/데이터 경로 쓰기 허용 재지정 ──
ReadWritePaths=/var/lib/blossom/lumina/web
ReadWritePaths=/var/log/blossom/lumina/web
ReadWritePaths=/run/blossom/lumina
WEBEOF
echo "  → lumina-web override 완료"

# ─── 6. nginx 중복 default_server 수정 ──────────────────
echo ""
echo "[6/8] nginx 중복 default_server 수정..."

# nginx.conf 본체의 default_server 블록 비활성화
if grep -q 'default_server' /etc/nginx/nginx.conf; then
    # 기존 설정 백업
    cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%Y%m%d%H%M%S)
    # 메인 nginx.conf에서 default_server 제거 (lumina.conf가 처리)
    sed -i 's/listen\(.*\)default_server/listen\1/g' /etc/nginx/nginx.conf
    echo "  → nginx.conf에서 default_server 키워드 제거"
fi

# lumina.conf의 HTTP 리다이렉트를 테스트환경에 맞게 수정
# 자체서명 인증서에서는 OCSP Stapling 비활성화
if grep -q 'ssl_stapling on' /etc/nginx/conf.d/lumina.conf; then
    cp /etc/nginx/conf.d/lumina.conf /etc/nginx/conf.d/lumina.conf.bak
    sed -i 's/ssl_stapling on;/ssl_stapling off;/g' /etc/nginx/conf.d/lumina.conf
    sed -i 's/ssl_stapling_verify on;/ssl_stapling_verify off;/g' /etc/nginx/conf.d/lumina.conf
    echo "  → 자체서명 인증서: OCSP Stapling 비활성화"
fi

# nginx 설정 검증
echo "  nginx 설정 테스트..."
nginx -t 2>&1 || {
    echo "  → nginx 설정 오류! 상세 로그:"
    nginx -t 2>&1
    echo "  → nginx.conf 내용:"
    grep -n 'server\|listen\|default' /etc/nginx/nginx.conf | head -20
}

# ─── 7. 런타임 디렉터리 생성 ────────────────────────────
echo ""
echo "[7/8] 런타임 디렉터리 생성..."
mkdir -p /run/blossom/lumina
chown lumina:lumina /run/blossom/lumina
chmod 755 /run/blossom/lumina
echo "  → /run/blossom/lumina 준비 완료"

# ─── 8. systemd 리로드 + 서비스 기동 ────────────────────
echo ""
echo "[8/8] 서비스 기동..."
systemctl daemon-reload

# 먼저 실패 카운터 리셋
systemctl reset-failed lumina-ap.service 2>/dev/null || true
systemctl reset-failed lumina-web.service 2>/dev/null || true

# MariaDB 확인
echo ""
echo "--- MariaDB ---"
systemctl is-active mariadb && echo "  → MariaDB OK" || {
    systemctl start mariadb
    echo "  → MariaDB 시작"
}

# lumina-ap 시작
echo ""
echo "--- lumina-ap ---"
systemctl stop lumina-ap 2>/dev/null || true
systemctl start lumina-ap 2>&1 || true
sleep 2
systemctl status lumina-ap --no-pager -l 2>&1 | head -20

# lumina-web 시작
echo ""
echo "--- lumina-web ---"
systemctl stop lumina-web 2>/dev/null || true
systemctl start lumina-web 2>&1 || true
sleep 2
systemctl status lumina-web --no-pager -l 2>&1 | head -20

# nginx 시작
echo ""
echo "--- nginx ---"
systemctl stop nginx 2>/dev/null || true
systemctl start nginx 2>&1 || true
sleep 1
systemctl status nginx --no-pager -l 2>&1 | head -20

# ─── 최종 검증 ──────────────────────────────────────────
echo ""
echo "============================================"
echo "  최종 검증"
echo "============================================"
echo ""
echo "=== 프로세스 확인 ==="
ps -ef | grep -E 'lumina|gunicorn|mysql|nginx' | grep -v grep || echo "(no processes)"

echo ""
echo "=== 포트 확인 ==="
ss -tlnp | grep -E '3306|5100|8000|80|443' || echo "(no ports)"

echo ""
echo "=== 서비스 상태 요약 ==="
for svc in mariadb lumina-ap lumina-web nginx; do
    status=$(systemctl is-active "$svc" 2>/dev/null || echo "inactive")
    printf "  %-15s : %s\n" "$svc" "$status"
done

echo ""
echo "=== 프로세스 사용자 확인 ==="
ps -eo user,pid,comm | grep -E 'lumina|gunicorn' | grep -v grep || echo "  (주의: lumina 프로세스 없음)"

echo ""
echo "=== 연결 테스트 ==="
# AP health
curl -sk https://127.0.0.1:5100/health 2>&1 && echo "" || echo "  AP(5100): 연결 실패"
# WEB health (gunicorn direct)
curl -s http://127.0.0.1:8000/ 2>&1 | head -5 || echo "  WEB(8000): 연결 실패"
# NGINX (HTTPS)
curl -sk https://127.0.0.1/ 2>&1 | head -5 || echo "  NGINX(443): 연결 실패"

echo ""
echo "=== 최근 오류 로그 ==="
echo "--- lumina-ap ---"
journalctl -u lumina-ap --no-pager -n 5 2>&1 | tail -5
echo "--- lumina-web ---"
journalctl -u lumina-web --no-pager -n 5 2>&1 | tail -5
echo "--- nginx ---"
journalctl -u nginx --no-pager -n 5 2>&1 | tail -5

echo ""
echo "============================================"
echo "  스크립트 완료"
echo "============================================"
