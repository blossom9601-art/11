#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
cd /opt/blossom/lumina/web
export PYTHONPATH=/opt/blossom/lumina/web
set -a; source /etc/blossom/lumina/web.env 2>/dev/null; set +a

python3.9 << 'PYEOF'
import sys, os
sys.path.insert(0, '.')
from app import create_app
app = create_app()

with app.app_context():
    with app.test_client() as c:
        c.post('/login', data={'employee_id': 'admin', 'password': 'admin1234!'}, follow_redirects=True)
        
        # Test the correct onpremise API
        resp = c.get('/api/hardware/onpremise/assets')
        print(f"[/api/hardware/onpremise/assets] status={resp.status_code}")
        data = resp.get_json()
        if data:
            print(f"  success={data.get('success')}")
            print(f"  error={data.get('error', data.get('message', ''))[:500]}")
            print(f"  total={data.get('total')}")
            print(f"  rows_count={len(data.get('rows', []))}")
        else:
            print(f"  body: {resp.data[:500]}")
        
        # Test dashboard page content
        resp = c.get('/dashboard')
        print(f"\n[/dashboard] status={resp.status_code}")
        body = resp.data.decode('utf-8', errors='replace')
        # Check if it redirects to SPA
        if resp.status_code == 302:
            print(f"  Location: {resp.headers.get('Location')}")
        elif resp.status_code == 200:
            # Check what template is being used
            if 'spa_shell' in body:
                print("  -> SPA shell rendered")
            elif 'dashboard' in body.lower():
                print(f"  -> Dashboard template (len={len(body)})")
            else:
                print(f"  -> Unknown template (len={len(body)}) preview: {body[:200]}")
        
        # Test /p/dashboard with SPA header
        resp = c.get('/p/dashboard', headers={'X-Requested-With': 'blossom-spa'})
        print(f"\n[/p/dashboard SPA] status={resp.status_code} len={len(resp.data)}")
        body = resp.data.decode('utf-8', errors='replace')
        if 'dashboard' in body.lower()[:500]:
            print("  -> Contains dashboard content")
        # Check for JS errors in the template
        if 'fetchDashboardStats' in body or 'loadDashboard' in body or '/api/dashboard' in body:
            print("  -> Has dashboard JS fetch calls")
        else:
            print("  -> No dashboard JS fetch found in first 5K chars")
            # Show what scripts are loaded
            import re
            scripts = re.findall(r'<script[^>]*src="([^"]*)"', body)
            print(f"  -> Scripts: {scripts[:10]}")
PYEOF
REMOTE
