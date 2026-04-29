#!/bin/bash
set -e
rm -rf /var/cache/nginx/blossom_proxy/*
systemctl restart blossom-web
sleep 2
echo "--- v2 endpoints registered ---"
/opt/blossom/web/venv/bin/python -c "
import sys; sys.path.insert(0, '/opt/blossom/web')
from app import create_app
app = create_app()
rules = sorted([str(r) for r in app.url_map.iter_rules() if '/api/chat/v2' in str(r)])
for r in rules: print(r)
"
echo "--- live page check ---"
curl -sk https://localhost/addon/chat -H 'X-Requested-With: blossom-spa' | grep -oE 'data-rooms-url="[^"]+"|3\.chat\.js\?v=[^"]+' | sort -u
