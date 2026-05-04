#!/usr/bin/env bash
# Lumina 에이전트 Linux 설치 스크립트
# 사용법: sudo bash install.sh

set -euo pipefail

INSTALL_DIR="/opt/lumina"
CONF_DIR="/etc/lumina"
DATA_DIR="/var/lib/lumina"
LOG_DIR="/var/log/lumina"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Lumina 자산 자동 탐색 에이전트 설치 ==="

# 1) 디렉터리 생성
mkdir -p "$INSTALL_DIR" "$CONF_DIR" "$DATA_DIR" "$LOG_DIR"

# 2) 에이전트 파일 복사
cp -r "$AGENT_ROOT/common" "$INSTALL_DIR/"
cp -r "$AGENT_ROOT/linux"  "$INSTALL_DIR/"

# 3) 기본 설정 파일 생성 (기존 파일 보존)
if [ ! -f "$CONF_DIR/lumina.conf" ]; then
    cat > "$CONF_DIR/lumina.conf" << 'EOF'
[agent]
# Blossom 서버 URL (필수 — 서버 IP를 입력하세요)
# 예: http://192.168.1.10:8080/api/agent/upload
server_url =

# 수집 주기 (초). 기본값: 3600 (1시간)
interval = 3600

# JSON 출력 디렉터리 (서버 전송 실패 시 fallback 저장 경로)
output_dir = /var/lib/lumina

# 수집 항목 (comma-separated): interface, account, authority, firewalld, storage, package
collectors = interface,account,authority,firewalld,storage,package
EOF
    echo "  설정 파일 생성: $CONF_DIR/lumina.conf"
    echo "  ※ server_url에 Blossom 서버 IP를 입력하세요!"
else
    echo "  설정 파일 유지: $CONF_DIR/lumina.conf (기존 파일 보존)"
fi

# 4) systemd 서비스 등록
cp "$SCRIPT_DIR/blossom-agent.service" /etc/systemd/system/lumina.service
systemctl daemon-reload
echo "  systemd 서비스 등록 완료"

echo ""
echo "=== 설치 완료 ==="
echo ""
echo "  ★ 먼저 설정 파일에서 서버 주소를 입력하세요:"
echo "    vi $CONF_DIR/lumina.conf"
echo "    server_url = http://<서버IP>:8080/api/agent/upload"
echo ""
echo "  시작:   sudo systemctl start lumina"
echo "  자동시작: sudo systemctl enable lumina"
echo "  상태:   sudo systemctl status lumina"
echo "  로그:   journalctl -u lumina -f"
echo "  JSON:   ls $DATA_DIR/"
echo ""
