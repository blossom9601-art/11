#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
echo "=== Fixing log directory ==="
mkdir -p /var/log/blossom/lumina/web
chown -R lumina:lumina /var/log/blossom/lumina
chmod -R 775 /var/log/blossom/lumina
ls -la /var/log/blossom/lumina/web/

echo ""
echo "=== Also fix /var/lib/blossom ==="
mkdir -p /var/lib/blossom/lumina/web
chown -R lumina:lumina /var/lib/blossom
chmod -R 775 /var/lib/blossom

echo ""
echo "=== Restarting lumina-web ==="
systemctl restart lumina-web
sleep 4

echo ""
echo "=== Service status ==="
systemctl is-active lumina-web
journalctl -u lumina-web --since "10 sec ago" --no-pager -q 2>/dev/null | grep -iE 'error|fail|started|active' | tail -10

echo ""
echo "=== Test via curl ==="
# Wrong password
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -d "employee_id=admin&password=wrongpass" https://localhost/login -k)
echo "[WRONG PWD] HTTP $HTTP_CODE"

# Correct password (follow 1 redirect)
curl -s -k -c /tmp/blossom_cookie.txt -d "employee_id=admin&password=admin1234!" https://localhost/login -o /dev/null -w "HTTP %{http_code} redirect=%{redirect_url}\n"

echo ""
echo "=== Test dashboard API with session cookie ==="
curl -s -k -L -c /tmp/blossom_cookie.txt -b /tmp/blossom_cookie.txt -d "employee_id=admin&password=admin1234!" https://localhost/login -o /dev/null
DASH_RESP=$(curl -s -k -b /tmp/blossom_cookie.txt https://localhost/api/dashboard/stats?range=1m)
echo "[DASHBOARD] $DASH_RESP" | head -c 500
REMOTE
