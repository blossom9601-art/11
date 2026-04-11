#!/bin/bash
echo "=== 1. Static file paths ==="
ls -la /opt/blossom/lumina/web/static/ 2>/dev/null | head -20
echo ""

echo "=== 2. CSS file check ==="
ls -la /opt/blossom/lumina/web/static/css/blossom.css 2>/dev/null
ls -la /opt/blossom/lumina/web/static/css/authentication.css 2>/dev/null
ls -la /opt/blossom/lumina/web/static/css/admin.css 2>/dev/null
echo ""

echo "=== 3. Image check ==="
ls -la /opt/blossom/lumina/web/static/image/logo/ 2>/dev/null
ls -la /opt/blossom/lumina/web/static/image/svg/favicon/ 2>/dev/null | head -5
echo ""

echo "=== 4. Gunicorn static file test ==="
echo -n "blossom.css: HTTP "
curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/static/css/blossom.css
echo ""
echo -n "authentication.css: HTTP "
curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/static/css/authentication.css
echo ""
echo -n "admin.css: HTTP "
curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/static/css/admin.css
echo ""
echo -n "blossom.js: HTTP "
curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/static/js/blossom.js
echo ""
echo -n "sign-in.js: HTTP "
curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/static/js/authentication/11-2.basic/sign-in.js
echo ""

echo "=== 5. Nginx static file test ==="
echo -n "HTTPS blossom.css: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/blossom.css
echo ""
echo -n "HTTPS authentication.css: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/authentication.css
echo ""

echo ""
echo "=== 6. Nginx config ==="
cat /etc/nginx/conf.d/lumina.conf 2>/dev/null

echo ""
echo "=== 7. Static dir permissions ==="
ls -ld /opt/blossom/lumina/web/static/
ls -ld /opt/blossom/lumina/web/static/css/
stat -c "%a %U:%G %n" /opt/blossom/lumina/web/static/css/blossom.css 2>/dev/null

echo ""
echo "=== 8. SELinux on static ==="
ls -Z /opt/blossom/lumina/web/static/css/blossom.css 2>/dev/null
ls -Z /opt/blossom/lumina/web/static/css/authentication.css 2>/dev/null

echo ""
echo "=== 9. Login background image ==="
find /opt/blossom/lumina/web/static -name "*.jpg" -path "*login*" -o -name "*.jpg" -path "*auth*" -o -name "*.jpg" -path "*sign*" 2>/dev/null | head -5
find /opt/blossom/lumina/web/static -name "*.jpg" -path "*ocean*" -o -name "*.jpg" -path "*wave*" -o -name "*.jpg" -path "*sea*" -o -name "*.jpg" -path "*surf*" 2>/dev/null | head -5
find /opt/blossom/lumina/web/static -name "*.jpg" -path "*background*" -o -name "*.jpg" -path "*bg*" 2>/dev/null | head -5

echo ""
echo "=== 10. authentication.css first 30 lines ==="
head -30 /opt/blossom/lumina/web/static/css/authentication.css 2>/dev/null
