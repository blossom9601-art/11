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
    # Find the correct onpremise API routes
    rules = list(app.url_map.iter_rules())
    hw_rules = [r for r in rules if 'onpremise' in str(r) or 'hw-server' in str(r) or 'hardware' in str(r).lower()]
    print("=== Hardware/Server API routes ===")
    for r in sorted(hw_rules, key=str):
        print(f"  {r} -> {r.endpoint} [{','.join(sorted(r.methods - {'HEAD','OPTIONS'}))}]")
    
    # Find dashboard routes
    dash_rules = [r for r in rules if 'dashboard' in str(r)]
    print("\n=== Dashboard routes ===")
    for r in sorted(dash_rules, key=str):
        print(f"  {r} -> {r.endpoint} [{','.join(sorted(r.methods - {'HEAD','OPTIONS'}))}]")
    
    # Test with correct API
    with app.test_client() as c:
        c.post('/login', data={'employee_id': 'admin', 'password': 'admin1234!'}, follow_redirects=True)
        
        # Try various paths
        for path in ['/api/hw/servers/onpremise', '/api/hardware/servers/onpremise', 
                     '/api/hw-servers/onpremise', '/api/hw/server/onpremise']:
            resp = c.get(path)
            if resp.status_code != 404:
                data = resp.get_json()
                print(f"\n[{path}] status={resp.status_code}")
                if data:
                    print(f"  success={data.get('success')} error={data.get('error', data.get('message', ''))[:200]}")
                break
PYEOF
REMOTE
