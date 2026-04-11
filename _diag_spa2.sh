#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
echo "=== Nginx proxy headers ==="
grep -i 'proxy_set_header\|forwarded' /etc/nginx/conf.d/lumina.conf 2>/dev/null
grep -i 'proxy_set_header\|forwarded' /etc/nginx/nginx.conf 2>/dev/null

echo ""
echo "=== Test actual HTTPS request from browser perspective ==="
# Simulate what the browser's SPA fetch does
curl -s -k -o /tmp/spa_resp.html -w "HTTP %{http_code} size=%{size_download}" \
  -H "X-Requested-With: blossom-spa" \
  -H "Cookie: session=$(curl -s -k -c - -d 'employee_id=admin&password=admin1234!' https://localhost/login | grep session | awk '{print $NF}')" \
  https://localhost/p/dashboard
echo ""
echo "Response has main-content: $(grep -c 'main-content' /tmp/spa_resp.html)"
echo "Response first line: $(head -1 /tmp/spa_resp.html)"

echo ""
echo "=== Check if HTTPS redirect causes issues ==="
# Test fetch without X-Forwarded-Proto
curl -s -o /dev/null -w "HTTP %{http_code}" -H "X-Requested-With: blossom-spa" http://127.0.0.1:8000/p/dashboard 2>/dev/null
echo " (direct to gunicorn without X-Forwarded-Proto)"

# Test with X-Forwarded-Proto
curl -s -o /dev/null -w "HTTP %{http_code}" -H "X-Requested-With: blossom-spa" -H "X-Forwarded-Proto: https" http://127.0.0.1:8000/p/dashboard 2>/dev/null
echo " (with X-Forwarded-Proto: https)"

echo ""
echo "=== security.py _force_https check ==="
grep -n '_force_https\|X-Forwarded-Proto\|is_secure' /opt/blossom/lumina/web/app/security.py | head -10
REMOTE
