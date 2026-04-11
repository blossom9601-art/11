#!/bin/bash
set -e

echo "=== [1] AP 서비스 시작 시도 ==="
# AP wsgi.py가 실제 실행 가능한지 확인
echo "  AP wsgi.py 확인:"
python3 -c "import sys; sys.path.insert(0,'/opt/blossom/lumina'); import ap; print('  AP 모듈 임포트 OK, version:', ap.__version__)" 2>&1

echo ""
echo "=== [2] AP systemd 서비스 시작 ==="
# PrivateUsers=yes가 Rocky 8에서 문제를 일으킬 수 있으므로 일단 override
mkdir -p /etc/systemd/system/lumina-ap.service.d
cat > /etc/systemd/system/lumina-ap.service.d/override.conf << 'OVEOF'
[Service]
# 테스트 환경: 보안 샌드박스 일부 완화
PrivateUsers=no
MemoryDenyWriteExecute=no
ProtectSystem=full
OVEOF

mkdir -p /etc/systemd/system/lumina-web.service.d
cat > /etc/systemd/system/lumina-web.service.d/override.conf << 'OVEOF'
[Service]
# 테스트 환경: 보안 샌드박스 일부 완화
PrivateUsers=no
MemoryDenyWriteExecute=no
ProtectSystem=full
OVEOF

systemctl daemon-reload

echo "  AP 서비스 시작..."
systemctl start lumina-ap 2>&1 || true
sleep 2
echo "  AP 상태: $(systemctl is-active lumina-ap 2>&1)"
systemctl status lumina-ap --no-pager 2>&1 | tail -10

echo ""
echo "=== [3] WEB 서비스 시작 ==="
echo "  Gunicorn 확인:"
which gunicorn 2>&1 || echo "  gunicorn 경로 확인 필요"
gunicorn --version 2>&1 || echo "  gunicorn 버전 확인 실패"

echo ""
echo "  WEB 서비스 시작..."
systemctl start lumina-web 2>&1 || true
sleep 2
echo "  WEB 상태: $(systemctl is-active lumina-web 2>&1)"
systemctl status lumina-web --no-pager 2>&1 | tail -10

echo ""
echo "=== [4] NGINX 설정 및 시작 ==="
# NGINX 설정 수정 (자체서명 인증서 환경)
echo "  NGINX 설정 확인..."
nginx -t 2>&1 || true

echo ""
echo "  NGINX 시작..."
systemctl start nginx 2>&1 || true
echo "  NGINX 상태: $(systemctl is-active nginx 2>&1)"

echo ""
echo "=== [5] 포트 확인 ==="
ss -tlnp | grep -E '5100|8000|443|80|3306' 2>&1

echo ""
echo "=== [6] 방화벽 설정 ==="
if systemctl is-active firewalld >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=5100/tcp 2>&1 || true
    firewall-cmd --permanent --add-service=https 2>&1 || true
    firewall-cmd --permanent --add-service=http 2>&1 || true
    firewall-cmd --reload 2>&1 || true
    echo "  방화벽 규칙 추가 완료"
else
    echo "  firewalld 미실행 (방화벽 규칙 생략)"
fi

echo ""
echo "=== 서비스 상태 종합 ==="
echo "  MariaDB:   $(systemctl is-active mariadb)"
echo "  lumina-ap:  $(systemctl is-active lumina-ap)"
echo "  lumina-web: $(systemctl is-active lumina-web)"
echo "  nginx:      $(systemctl is-active nginx)"
