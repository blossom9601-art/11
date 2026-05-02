#!/bin/bash
# Incremental deploy: 업무 상태 placeholder (CCTV / 온습도 목록)
set -eu
BASE="/mnt/c/Users/ME/Desktop/blossom"
# 다른 VM이면: DEPLOY_HOST=root@192.168.56.xxx bash ...
HOST="${DEPLOY_HOST:-root@192.168.56.108}"
WEB="${DEPLOY_WEB_ROOT:-/opt/blossom/web}"
PW="${DEPLOY_PW:-123456}"

FILES=(
  "static/js/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.js"
  "static/js/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.js"
  "app/templates/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.html"
  "app/templates/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.html"
)

SSHOPT="-o StrictHostKeyChecking=no"
for rel in "${FILES[@]}"; do
  echo "[scp] $rel"
  sshpass -p "$PW" scp $SSHOPT "$BASE/$rel" "$HOST:$WEB/$rel"
done

sshpass -p "$PW" ssh $SSHOPT "$HOST" bash <<'REMOTE'
set -e
WEB=/opt/blossom/web
for p in \
  "$WEB/static/js/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.js" \
  "$WEB/static/js/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.js" \
  "$WEB/app/templates/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.html" \
  "$WEB/app/templates/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.html"
do
  chown lumina:lumina "$p"
done
systemctl restart lumina-web
sleep 3
systemctl is-active lumina-web
REMOTE

echo "=== HTTP quick check ==="
sshpass -p "$PW" ssh $SSHOPT "$HOST" 'curl -s --max-time 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/'
echo "Done."
