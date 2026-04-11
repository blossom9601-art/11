#!/bin/bash
echo "=== 1. Nginx error log ==="
tail -20 /var/log/nginx/error.log 2>/dev/null | grep -i "stat\|open\|denied\|permission\|static"
echo ""

echo "=== 2. Actual nginx config path ==="
grep -A2 'location /static' /etc/nginx/conf.d/lumina.conf
echo ""

echo "=== 3. SELinux status ==="
getenforce
echo ""

echo "=== 4. SELinux context on static files ==="
ls -Z /opt/blossom/lumina/web/static/css/blossom.css
ls -Z /opt/blossom/lumina/web/static/
echo ""

echo "=== 5. Check nginx error log for audit denials ==="
ausearch -m avc -ts recent 2>/dev/null | tail -10 || grep "denied" /var/log/audit/audit.log 2>/dev/null | tail -5

echo ""
echo "=== 6. Test: can nginx user read files? ==="
sudo -u nginx cat /opt/blossom/lumina/web/static/css/blossom.css > /dev/null 2>&1 && echo "nginx can read" || echo "nginx CANNOT read"

echo ""
echo "=== 7. Nginx web error log ==="
tail -10 /var/log/blossom/lumina/web/error.log 2>/dev/null | grep -i "static\|404"
echo ""

echo "=== 8. Full nginx error ==="
tail -20 /var/log/nginx/error.log 2>/dev/null
