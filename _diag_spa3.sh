#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
echo "=== Dashboard JS/CSS files ==="
ls -la /opt/blossom/lumina/web/static/js/1.dashboard/1.dashboard.js 2>/dev/null
ls -la /opt/blossom/lumina/web/static/css/dashboard.css 2>/dev/null
ls -la /opt/blossom/lumina/web/static/js/blossom-query.js 2>/dev/null

echo ""
echo "=== Test HTTPS fetch of static files ==="
for f in /static/js/1.dashboard/1.dashboard.js /static/css/dashboard.css /static/js/blossom.js; do
  CODE=$(curl -s -k -o /dev/null -w '%{http_code}' "https://localhost${f}")
  echo "${f} -> HTTP ${CODE}"
done

echo ""
echo "=== Full SPA boot test from browser perspective ==="
# 1. Login and get session
SESSION=$(curl -s -k -c - -d "employee_id=admin&password=admin1234!" -L https://localhost/login 2>/dev/null | grep "session" | awk '{print $NF}')
echo "Session cookie obtained: ${SESSION:0:20}..."

# 2. Visit /p/dashboard as browser (no SPA header) - get SPA shell length
SHELL_SIZE=$(curl -s -k -b "session=${SESSION}" -o /dev/null -w '%{size_download}' https://localhost/p/dashboard)
echo "SPA shell size: ${SHELL_SIZE}"

# 3. SPA fetch /p/dashboard with header - get content
SPA_RESP=$(curl -s -k -b "session=${SESSION}" -H "X-Requested-With: blossom-spa" https://localhost/p/dashboard)
echo "SPA content size: ${#SPA_RESP}"
echo "Has main-content: $(echo "$SPA_RESP" | grep -c 'class="main-content"')"
echo "Has 1.dashboard.js: $(echo "$SPA_RESP" | grep -c '1.dashboard.js')"

# 4. Test dashboard API with session
API_RESP=$(curl -s -k -b "session=${SESSION}" https://localhost/api/dashboard/stats?range=1m)
echo ""
echo "API response: ${API_RESP:0:200}"

echo ""
echo "=== Check for common JS issues ==="
# Check if Lottie CDN is reachable
curl -s -o /dev/null -w "Lottie CDN: HTTP %{http_code}" https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js --connect-timeout 5 2>/dev/null
echo ""

# Check if nodata SVG exists
ls -la /opt/blossom/lumina/web/static/image/svg/free-animated-no-data.json 2>/dev/null || echo "Lottie JSON: NOT FOUND"
REMOTE
