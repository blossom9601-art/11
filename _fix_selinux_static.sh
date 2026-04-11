#!/bin/bash
set -e

echo "=== 1. Fix SELinux context for static files ==="
semanage fcontext -a -t httpd_sys_content_t "/opt/blossom/lumina/web/static(/.*)?" 2>/dev/null || true
restorecon -Rv /opt/blossom/lumina/web/static/
echo ""

echo "=== 2. Fix SELinux context for entire web dir (nginx needs to traverse) ==="
semanage fcontext -a -t httpd_sys_content_t "/opt/blossom/lumina/web(/.*)?" 2>/dev/null || true
restorecon -Rv /opt/blossom/lumina/web/ 2>&1 | tail -5
echo ""

echo "=== 3. Fix nginx log directory permissions ==="
chown -R nginx:nginx /var/log/blossom/lumina/web/ 2>/dev/null || true
chmod 755 /var/log/blossom/lumina/web/
semanage fcontext -a -t httpd_log_t "/var/log/blossom/lumina/web(/.*)?" 2>/dev/null || true
restorecon -Rv /var/log/blossom/lumina/web/
echo ""

echo "=== 4. Allow nginx to use network connect (for proxy) ==="
setsebool -P httpd_can_network_connect 1
echo ""

echo "=== 5. Restart nginx ==="
nginx -t && systemctl restart nginx
echo ""

echo "=== 6. Verify ==="
echo -n "HTTPS blossom.css: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/blossom.css
echo ""
echo -n "HTTPS authentication.css: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/authentication.css
echo ""
echo -n "HTTPS admin.css: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/admin.css
echo ""
echo -n "HTTPS sign-in.js: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/js/authentication/11-2.basic/sign-in.js
echo ""
echo -n "HTTPS blossom.js: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/js/blossom.js
echo ""
echo -n "HTTPS /login: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/login
echo ""

echo ""
echo "=== 7. SELinux context check ==="
ls -Z /opt/blossom/lumina/web/static/css/blossom.css
echo ""

echo "=== 8. Nginx error log ==="
tail -5 /var/log/nginx/error.log 2>/dev/null
echo ""
echo "DONE"
