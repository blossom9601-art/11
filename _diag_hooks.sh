#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
# Check before_request hooks in __init__.py around lines 1503-1840
echo "=== Before Request at line 1503 ==="
sed -n '1500,1530p' /opt/blossom/lumina/web/app/__init__.py

echo ""
echo "=== Before Request at line 1722 ==="
sed -n '1720,1770p' /opt/blossom/lumina/web/app/__init__.py

echo ""
echo "=== Session expiry before_request at line 1764 ==="
sed -n '1764,1830p' /opt/blossom/lumina/web/app/__init__.py

echo ""
echo "=== Permission before_request at line 1831 ==="
sed -n '1831,1870p' /opt/blossom/lumina/web/app/__init__.py

echo ""
echo "=== From security.py before_request ==="
sed -n '380,400p' /opt/blossom/lumina/web/app/security.py
REMOTE
