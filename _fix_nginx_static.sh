#!/bin/bash
set -e
sed -i 's|alias /opt/blossom/lumina/web/app/static/;|alias /opt/blossom/lumina/web/static/;|' /etc/nginx/conf.d/lumina.conf
nginx -t
systemctl reload nginx
echo ""
echo -n "HTTPS blossom.css: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/blossom.css
echo ""
echo -n "HTTPS authentication.css: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/authentication.css
echo ""
echo -n "HTTPS sign-in.js: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/js/authentication/11-2.basic/sign-in.js
echo ""
echo -n "HTTPS /login: HTTP "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/login
echo ""
echo "DONE"
