#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
echo "=== JOURNAL ERRORS (last 5 min) ==="
journalctl -u lumina-web --since "5 min ago" --no-pager -q 2>/dev/null | grep -iE 'error|traceback|exception|fail' | tail -40

echo ""
echo "=== FULL JOURNAL (last 3 min) ==="
journalctl -u lumina-web --since "3 min ago" --no-pager -q 2>/dev/null | tail -60

echo ""
echo "=== Test dashboard API ==="
cd /opt/blossom/lumina/web
export PYTHONPATH=/opt/blossom/lumina/web
set -a; source /etc/blossom/lumina/web.env 2>/dev/null; set +a

python3.9 << 'PYEOF'
import sys, os, json
sys.path.insert(0, '.')
from app import create_app
app = create_app()
with app.app_context():
    with app.test_client() as c:
        # Login first
        c.post('/login', data={'employee_id': 'admin', 'password': 'admin1234!'}, follow_redirects=True)
        
        # Test dashboard page (SPA route)
        resp = c.get('/p/dashboard', headers={'X-Requested-With': 'blossom-spa'})
        print(f"[/p/dashboard SPA] status={resp.status_code} len={len(resp.data)}")
        if resp.status_code != 200:
            print(f"  body preview: {resp.data[:300]}")
        
        # Test dashboard stats API
        resp = c.get('/api/dashboard/stats?range=1m')
        data = resp.get_json()
        print(f"[/api/dashboard/stats] status={resp.status_code} success={data.get('success') if data else 'NO JSON'}")
        
        # Test server (onpremise) API
        resp = c.get('/api/servers/onpremise')
        print(f"[/api/servers/onpremise] status={resp.status_code}")
        data = resp.get_json()
        if data:
            print(f"  success={data.get('success')} error={data.get('error', data.get('message', ''))[:200]}")
        else:
            print(f"  body: {resp.data[:300]}")
        
        # Test with query params
        resp = c.get('/api/servers/onpremise?page=1&per_page=20')
        print(f"[/api/servers/onpremise?page=1] status={resp.status_code}")
        data = resp.get_json()
        if data:
            print(f"  success={data.get('success')} total={data.get('total')} error={data.get('error', data.get('message', ''))[:200]}")
PYEOF

echo ""
echo "=== GUNICORN ERROR LOG (last 30 lines) ==="
tail -30 /var/log/blossom/lumina/web/error.log 2>/dev/null | grep -iE 'error|traceback|exception|500' | tail -20
REMOTE
