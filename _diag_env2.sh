#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
# Check systemd service
systemctl cat lumina-web.service 2>/dev/null
echo "=== GUNICORN PATH ==="
which gunicorn
echo "=== GUNICORN PYTHON ==="
head -1 $(which gunicorn)
echo "=== PIP LIST ==="
pip3 list 2>/dev/null | grep -i -E "sqlalchemy|flask|gunicorn" | head -10
echo "=== PYTHON3.9 CHECK ==="
which python3.9 2>/dev/null
python3.9 -c "import sqlalchemy; print('OK')" 2>/dev/null
echo "=== /usr/local/bin ==="
ls /usr/local/bin/python* /usr/local/bin/gunicorn 2>/dev/null
REMOTE
