#!/bin/bash
set -e
sshpass -p '123456' scp /mnt/c/Users/ME/Desktop/blossom/app/services/brand_setting_service.py root@192.168.56.105:/opt/blossom/lumina/web/app/services/brand_setting_service.py
sshpass -p '123456' ssh root@192.168.56.105 << 'REMOTE'
chown lumina:lumina /opt/blossom/lumina/web/app/services/brand_setting_service.py
systemctl restart lumina-web
sleep 5
systemctl status lumina-web --no-pager | head -8
echo ""
echo -n "/ : HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/
echo ""
echo -n "/login : HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/login
echo ""
echo -n "HTTPS / : HTTP "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/
echo ""
echo ""
echo "=== /login HTML ==="
curl -s --max-time 5 http://127.0.0.1:8000/login | head -20
echo ""
echo "=== Error log ==="
tail -5 /var/log/blossom/lumina/web/error.log 2>/dev/null || echo "(none)"
REMOTE
