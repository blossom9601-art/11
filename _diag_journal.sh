#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
echo "=== RECENT JOURNAL ERRORS (last 30 lines with errors) ==="
journalctl -u lumina-web --since "1 hour ago" --no-pager -q 2>/dev/null | grep -iE 'error|traceback|exception|500|internal|fail' | tail -30

echo ""
echo "=== FULL RECENT JOURNAL (last 50 lines) ==="
journalctl -u lumina-web --since "30 min ago" --no-pager -q 2>/dev/null | tail -50

echo ""
echo "=== NGINX ERROR LOG ==="
tail -20 /var/log/nginx/error.log 2>/dev/null

echo ""
echo "=== NGINX ACCESS - 500 errors ==="
grep ' 500 ' /var/log/nginx/access.log 2>/dev/null | tail -10
grep ' 500 ' /var/log/nginx/lumina_access.log 2>/dev/null | tail -10
REMOTE
