#!/bin/bash
echo -n "HTTPS blossom.css: "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/blossom.css
echo ""
echo -n "HTTPS auth.css: "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/css/authentication.css
echo ""
echo -n "HTTPS sign-in.js: "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/static/js/authentication/11-2.basic/sign-in.js
echo ""
echo -n "HTTPS /login: "
curl -sk --max-time 3 -o /dev/null -w "%{http_code}" https://127.0.0.1/login
echo ""
echo ""
ls -Z /opt/blossom/lumina/web/static/css/blossom.css
tail -3 /var/log/nginx/error.log 2>/dev/null
