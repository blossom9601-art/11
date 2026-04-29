#!/bin/bash
set -e
rm -rf /var/cache/nginx/blossom_proxy/*
systemctl restart blossom-web
sleep 2
echo "--- invite fn count ---"
grep -c inviteEntryToV2Channel /opt/blossom/web/static/js/addon_application/3.chat.js
echo "--- js cache version ---"
curl -sk https://localhost/addon/chat -H 'X-Requested-With: blossom-spa' | grep -oE '20260421-[0-9]+' | head -1
echo "--- v2 attrs ---"
curl -sk https://localhost/addon/chat -H 'X-Requested-With: blossom-spa' | grep -oE 'data-(rooms-url|api-root)="[^"]+"' | sort -u
