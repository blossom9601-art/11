#!/bin/bash
set -e
cd /opt/blossom/web
python3 -c 'import zipfile; zipfile.ZipFile("/tmp/_deploy_chat_front_v2.zip").extractall(".")'
echo "extracted"
rm -rf /var/cache/nginx/blossom_proxy/*
systemctl restart blossom-web
sleep 2
echo "---v2 attrs---"
curl -sk https://localhost/addon/chat -H 'X-Requested-With: blossom-spa' | grep -oE 'data-(rooms-url|api-root|directory-url)="[^"]+"' | sort -u
echo "---채널 tab---"
curl -sk https://localhost/addon/chat -H 'X-Requested-With: blossom-spa' | grep -oE '>채널<' | head -3
