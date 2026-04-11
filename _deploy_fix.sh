#!/bin/bash
HOST="root@192.168.56.105"

# 1. Deploy fixed dashboard_service.py
echo "=== Deploying dashboard_service.py ==="
sshpass -p '123456' scp /mnt/c/Users/ME/Desktop/blossom/app/services/dashboard_service.py $HOST:/opt/blossom/lumina/web/app/services/dashboard_service.py

# 2. Fix permissions and systemd override
sshpass -p '123456' ssh $HOST << 'REMOTE'
echo "=== Checking instance directory ==="
ls -la /opt/blossom/lumina/web/instance/ 2>/dev/null | head -5
id lumina

echo ""
echo "=== Ensuring instance dir exists and is writable ==="
mkdir -p /opt/blossom/lumina/web/instance
chown -R lumina:lumina /opt/blossom/lumina/web/instance
chmod 775 /opt/blossom/lumina/web/instance

echo ""
echo "=== Checking systemd ReadOnlyPaths ==="
grep -n 'ReadOnlyPaths' /usr/lib/systemd/system/lumina-web.service 2>/dev/null
grep -n 'ReadOnlyPaths' /etc/systemd/system/lumina-web.service.d/override.conf 2>/dev/null

echo ""
echo "=== Fixing systemd override to clear ReadOnlyPaths ==="
cat /etc/systemd/system/lumina-web.service.d/override.conf

# Add ReadOnlyPaths= (empty to clear) to override if not already present
if ! grep -q 'ReadOnlyPaths=' /etc/systemd/system/lumina-web.service.d/override.conf; then
    sed -i '/^ReadWritePaths=/a ReadOnlyPaths=' /etc/systemd/system/lumina-web.service.d/override.conf
    echo "[ADDED] ReadOnlyPaths= to override.conf"
fi

echo ""
echo "=== Updated override.conf ==="
cat /etc/systemd/system/lumina-web.service.d/override.conf

echo ""
echo "=== Reloading systemd and restarting lumina-web ==="
systemctl daemon-reload
systemctl restart lumina-web
sleep 3

echo ""
echo "=== Service status ==="
systemctl is-active lumina-web
journalctl -u lumina-web --since "10 sec ago" --no-pager -q 2>/dev/null | tail -10

echo ""
echo "=== Test login with test_client ==="
cd /opt/blossom/lumina/web
export PYTHONPATH=/opt/blossom/lumina/web
set -a; source /etc/blossom/lumina/web.env 2>/dev/null; set +a

python3.9 << 'PYEOF'
import sys, os
sys.path.insert(0, '.')
from app import create_app
app = create_app()
with app.app_context():
    print("=== LOGIN TEST ===")
    with app.test_client() as c:
        # Wrong password
        resp = c.post('/login', data={'employee_id': 'admin', 'password': 'wrongpass'}, follow_redirects=False)
        with c.session_transaction() as sess:
            flashes = sess.get('_flashes', [])
        print(f"[WRONG PWD] status={resp.status_code} flashes={flashes}")
    
    with app.test_client() as c:
        # Correct password
        resp = c.post('/login', data={'employee_id': 'admin', 'password': 'admin1234!'}, follow_redirects=False)
        with c.session_transaction() as sess:
            user_id = sess.get('user_id')
            emp_no = sess.get('emp_no')
        print(f"[CORRECT PWD] status={resp.status_code} Location={resp.headers.get('Location', 'NONE')} user_id={user_id} emp_no={emp_no}")
    
    # Dashboard API test
    with app.test_client() as c:
        c.post('/login', data={'employee_id': 'admin', 'password': 'admin1234!'}, follow_redirects=True)
        resp = c.get('/api/dashboard/stats?range=1m')
        data = resp.get_json()
        print(f"[DASHBOARD] status={resp.status_code} success={data.get('success') if data else 'NO JSON'}")
        if data and not data.get('success'):
            print(f"  error={data.get('message', 'unknown')}")
        elif data and data.get('success'):
            kpi = data.get('kpi', {})
            print(f"  kpi_keys={list(kpi.keys())}")
PYEOF
REMOTE
