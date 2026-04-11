#!/bin/bash
sshpass -p '123456' ssh -o StrictHostKeyChecking=no root@192.168.56.105 << 'ENDSSH'

echo "=== Nginx config CSP headers ==="
grep -rn -i 'content.security\|CSP\|script-src\|default-src' /etc/nginx/ 2>/dev/null

echo ""
echo "=== Full nginx site config ==="
cat /etc/nginx/conf.d/blossom.conf 2>/dev/null || cat /etc/nginx/conf.d/*.conf 2>/dev/null

echo ""
echo "=== Check gunicorn/web.env for CSP ==="
grep -i 'csp\|security' /etc/blossom/lumina/web.env 2>/dev/null

echo ""
echo "=== SPA shell page CSP (the one that governs SPA) ==="
python3 -c "
import requests
s = requests.Session()
s.verify = False
s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})
r = s.get('https://192.168.56.105/p/dashboard')
print('Shell CSP:', r.headers.get('Content-Security-Policy', 'NONE'))
# Show all CSP-related headers
for k, v in r.headers.items():
    if 'secur' in k.lower() or 'policy' in k.lower() or 'csp' in k.lower():
        print(f'{k}: {v}')
" 2>/dev/null

echo ""
echo "=== Flask deployed security.py CSP line ==="
grep -n 'Content-Security-Policy' /opt/blossom/lumina/web/app/security.py

echo ""
echo "=== Check __init__.py for CSP ==="
grep -n 'Content-Security-Policy\|CSP\|security_header' /opt/blossom/lumina/web/app/__init__.py | head -10

echo ""
echo "=== Deployed dashboard template script tags ==="
grep -n '<script' /opt/blossom/lumina/web/app/templates/1.dashboard/1.dashboard.html
ENDSSH
