#!/bin/bash
###############################################################################
# lumina — Blossom 에이전트 관리 CLI 래퍼
# 설치 경로: /opt/blossom/lumina/bin/lumina
# 심볼릭 링크: /usr/local/bin/lumina → /opt/blossom/lumina/bin/lumina
###############################################################################
set -euo pipefail

LUMINA_HOME="${LUMINA_HOME:-/opt/blossom/lumina}"
CLI_DIR="${LUMINA_HOME}/cli"

# Python 경로 결정
if command -v python3.9 &>/dev/null; then
    PYTHON=python3.9
elif command -v python3 &>/dev/null; then
    PYTHON=python3
else
    echo "오류: python3을 찾을 수 없습니다." >&2
    exit 1
fi

export PYTHONPATH="${CLI_DIR}:${PYTHONPATH:-}"
exec "$PYTHON" -m lumina_cli "$@"
