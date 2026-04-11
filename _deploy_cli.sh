#!/bin/bash
set -euo pipefail
SRC=/mnt/c/Users/ME/Desktop/blossom
SRV=root@192.168.56.105
SSHOPT="-o StrictHostKeyChecking=no"
PW="123456"

echo "=== Lumina CLI 배포 ==="

# Backend files
echo "[1/5] 백엔드 서비스 배포..."
sshpass -p "$PW" scp $SSHOPT \
  "$SRC/app/services/agent_cli_service.py" \
  "$SRV:/opt/blossom/lumina/web/app/services/"

sshpass -p "$PW" scp $SSHOPT \
  "$SRC/app/routes/agent_api.py" \
  "$SRV:/opt/blossom/lumina/web/app/routes/"

# CLI tool files
echo "[2/5] CLI 도구 배포..."
sshpass -p "$PW" scp $SSHOPT \
  "$SRC/tools/lumina_cli/__init__.py" \
  "$SRC/tools/lumina_cli/__main__.py" \
  "$SRC/tools/lumina_cli/main.py" \
  "$SRC/tools/lumina_cli/config.py" \
  "$SRC/tools/lumina_cli/api_client.py" \
  "$SRC/tools/lumina_cli/output.py" \
  "$SRV:/opt/blossom/lumina/cli/lumina_cli/"

sshpass -p "$PW" scp $SSHOPT \
  "$SRC/tools/lumina_cli/commands/__init__.py" \
  "$SRC/tools/lumina_cli/commands/agent.py" \
  "$SRV:/opt/blossom/lumina/cli/lumina_cli/commands/"

# Shell wrapper
echo "[3/5] lumina 래퍼 스크립트 배포..."
sshpass -p "$PW" scp $SSHOPT \
  "$SRC/tools/lumina_cli/lumina.sh" \
  "$SRV:/opt/blossom/lumina/bin/lumina"

# Bash completion
echo "[4/5] Bash 자동완성 배포..."
sshpass -p "$PW" scp $SSHOPT \
  "$SRC/tools/lumina_cli/lumina-completion.bash" \
  "$SRV:/etc/bash_completion.d/lumina"

# Set permissions + symlink + restart
echo "[5/5] 설정 적용 및 서비스 재시작..."
sshpass -p "$PW" ssh $SSHOPT "$SRV" '
chmod +x /opt/blossom/lumina/bin/lumina
ln -sf /opt/blossom/lumina/bin/lumina /usr/local/bin/lumina
pip3 install click requests 2>/dev/null || true
systemctl restart lumina-web
sleep 2
systemctl is-active lumina-web
echo "symlink: $(ls -la /usr/local/bin/lumina)"
echo "lumina version: $(/usr/local/bin/lumina --version 2>&1 || echo FAIL)"
'

echo ""
echo "=== 배포 완료 ==="
