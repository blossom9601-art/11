#!/bin/bash
curl -sk -c /tmp/cc.txt -X POST https://localhost/login --data-urlencode "username=admin" --data-urlencode "password=admin" -o /dev/null
echo "=== status_list.css served version (head) ==="
curl -sk -b /tmp/cc.txt "https://localhost/static/css/3.access_control/3-1.access_control/3-1-3.status/status_list.css?v=20260424b" | head -40
echo ""
echo "=== status_list.js served (last 20 lines) ==="
curl -sk -b /tmp/cc.txt "https://localhost/static/js/3.access_control/3-1.access_control/3-1-3.status/1.status_list.js?v=20260424a" | tail -20
echo ""
echo "=== SPA HTML script + css versions ==="
curl -sk -b /tmp/cc.txt -H "X-Requested-With: blossom-spa" https://localhost/p/access_control_status -o /tmp/spa.html
grep -oE '(status_list\.(css|js)|access_control\.css)\?v=[a-zA-Z0-9_]+' /tmp/spa.html