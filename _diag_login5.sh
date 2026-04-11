#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
# Check where BEFORE_REQUEST and SENTINEL debug markers are
grep -n 'BEFORE_REQUEST\|SENTINEL_v2' /opt/blossom/lumina/web/app/routes/auth.py | head -20

echo "---"
# Check the before_request in __init__.py
grep -n 'before_request\|BEFORE_REQUEST' /opt/blossom/lumina/web/app/__init__.py | head -10

echo "---"
# Check if there's an error before the login handler code
grep -n 'def login\|SENTINEL' /opt/blossom/lumina/web/app/routes/auth.py | head -10

echo "---"
# Check what's between BEFORE_REQUEST and SENTINEL in server auth.py (around login function)
sed -n '350,420p' /opt/blossom/lumina/web/app/routes/auth.py
REMOTE
