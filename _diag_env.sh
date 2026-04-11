#!/bin/bash
# Find Python + run diagnostic
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
# Find the gunicorn and python used by lumina-web
cat /etc/systemd/system/lumina-web.service 2>/dev/null
echo "---"
which python3
python3 -c "import sqlalchemy; print('SQLAlchemy', sqlalchemy.__version__)"
echo "---"
# Check if there's a virtualenv
ls -d /opt/blossom/lumina/web/.venv 2>/dev/null
ls -d /opt/blossom/lumina/web/venv 2>/dev/null  
ls -d /opt/blossom/lumina/.venv 2>/dev/null
REMOTE
