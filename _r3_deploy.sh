#!/bin/bash
set -e
WEB=/opt/blossom/lumina/web
SRC=/tmp/blossom_r3

cp $SRC/__init__.py   $WEB/app/__init__.py
cp $SRC/models.py     $WEB/app/models.py
cp $SRC/security.py   $WEB/app/security.py
cp $SRC/services/chat_service.py            $WEB/app/services/chat_service.py
cp $SRC/services/page_tab_config_service.py $WEB/app/services/page_tab_config_service.py
cp $SRC/services/brand_setting_service.py   $WEB/app/services/brand_setting_service.py
echo "6 files deployed"

chown -R lumina:lumina $WEB/
echo "ownership set"
