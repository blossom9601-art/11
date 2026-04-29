#!/bin/bash
###############################################################################
# lumina-web-start.sh
# 단일 systemd 유닛(lumina-web.service)에서 두 개의 Flask 앱을 동시 기동.
#   - Lumina Dashboard (python3.11 venv / 127.0.0.1:8000) : 백그라운드
#   - Lumina Web (자산관리 + 채팅, python3.11 venv / 127.0.0.1:8001) : 포그라운드
# 두 프로세스 모두 /opt/blossom/web/venv 를 공유 (python3.6 의존성 제거).
# 설치 경로: /usr/local/bin/lumina-web-start.sh
###############################################################################
set -e

# ── 환경 변수 로드 (DB 자격 / SECRET_KEY 등) ─────────────
if [ -f /etc/blossom/lumina/secure.env ]; then
  set -a
  . /etc/blossom/lumina/secure.env
  set +a
fi
export FLASK_ENV=${FLASK_ENV:-production}
export PYTHONDONTWRITEBYTECODE=1

VENV_GUNICORN=/opt/blossom/web/venv/bin/gunicorn

# ── (1) Dashboard gunicorn (python3.11 venv) — 백그라운드 ──
DASH_PID=""
if [ -d /opt/blossom/lumina/web ] && [ -x "$VENV_GUNICORN" ]; then
  "$VENV_GUNICORN" \
    --config /opt/blossom/lumina/web/gunicorn.conf.py \
    --chdir /opt/blossom/lumina/web \
    wsgi:application &
  DASH_PID=$!
fi

# ── 시그널 전파 + 자식 프로세스 정리 ─────────────────────
cleanup() {
  if [ -n "$DASH_PID" ] && kill -0 "$DASH_PID" 2>/dev/null; then
    kill -TERM "$DASH_PID" 2>/dev/null || true
    wait "$DASH_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 143' TERM INT

# ── (2) Asset Mgmt + Chat gunicorn (python3.11 venv) — 포그라운드 ──
exec "$VENV_GUNICORN" \
    --config /opt/blossom/web/gunicorn_blossom.conf.py \
    wsgi:application
