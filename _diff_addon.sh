#!/bin/bash
FILES=(
  "app/templates/addon_application/1.work_timeline.html"
  "static/js/addon_application/1.work_timeline.js"
  "static/css/addon_application.css"
  "app/templates/addon_application/2.alarm.html"
  "static/js/addon_application/2.alarm.js"
  "app/routes/main.py"
)

for f in "${FILES[@]}"; do
  LOCAL_MD5=$(md5sum "/mnt/c/Users/ME/Desktop/blossom/$f" 2>/dev/null | cut -d' ' -f1)
  REMOTE_MD5=$(sshpass -p '123456' ssh -o StrictHostKeyChecking=no root@192.168.56.105 "md5sum /opt/blossom/lumina/web/$f 2>/dev/null" | cut -d' ' -f1)
  if [ "$LOCAL_MD5" = "$REMOTE_MD5" ]; then
    echo "SAME: $f"
  else
    echo "DIFF: $f"
  fi
done
