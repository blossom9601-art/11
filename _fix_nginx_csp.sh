#!/bin/bash
# Fix duplicate security headers: remove CSP and other headers from nginx
# (Flask already sets them correctly with unsafe-inline/unsafe-eval)
# Also deploy hardware_asset_service.py ATTACH fix and restart services.

sshpass -p '123456' ssh -o StrictHostKeyChecking=no root@192.168.56.105 << 'ENDSSH'
set -e

echo "=== 1) Backup nginx config ==="
cp /etc/nginx/conf.d/lumina.conf /etc/nginx/conf.d/lumina.conf.bak2

echo "=== 2) Remove duplicate security headers from nginx ==="
# Comment out the security headers that Flask already sets.
# Keep the nginx config structure but disable the duplicate headers.
sed -i \
  -e 's/^\(\s*add_header Strict-Transport-Security\)/#\1/' \
  -e 's/^\(\s*add_header X-Content-Type-Options\s\+"nosniff"\)/#\1/' \
  -e 's/^\(\s*add_header X-Frame-Options\)/#\1/' \
  -e 's/^\(\s*add_header X-XSS-Protection\)/#\1/' \
  -e 's/^\(\s*add_header Content-Security-Policy\)/#\1/' \
  -e 's/^\(\s*add_header Referrer-Policy\)/#\1/' \
  -e 's/^\(\s*add_header Permissions-Policy\)/#\1/' \
  /etc/nginx/conf.d/lumina.conf

echo "=== 3) Verify nginx config ==="
nginx -t

echo "=== 4) Reload nginx ==="
systemctl reload nginx
echo "Nginx reloaded"

echo "=== 5) Verify CSP is now single ==="
python3 -c "
import requests
s = requests.Session()
s.verify = False
s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})
r = s.get('https://192.168.56.105/p/dashboard')
csp = r.headers.get('Content-Security-Policy', 'NONE')
print('CSP:', csp)
# Check for duplicates
if ',' in csp and 'default-src' in csp.split(',')[1]:
    print('WARNING: Still has duplicate CSP!')
else:
    print('OK: Single CSP policy')
# Verify unsafe-inline is present
if 'unsafe-inline' in csp:
    print('OK: unsafe-inline present')
else:
    print('WARNING: unsafe-inline missing!')
if 'unsafe-eval' in csp:
    print('OK: unsafe-eval present')
else:
    print('WARNING: unsafe-eval missing!')
" 2>/dev/null

echo ""
echo "DONE: Nginx CSP fix applied"
ENDSSH
