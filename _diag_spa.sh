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
        
        # 1. Direct visit to /p/dashboard (no SPA header) - should return SPA shell
        resp = c.get('/p/dashboard')
        body = resp.data.decode('utf-8', errors='replace')
        has_spa_boot = 'data-spa-boot' in body
        has_main = 'main-content' in body
        has_blossom_js = 'blossom.js' in body
        print(f"[Direct /p/dashboard] status={resp.status_code} len={len(body)}")
        print(f"  has data-spa-boot: {has_spa_boot}")
        print(f"  has main-content: {has_main}")
        print(f"  has blossom.js: {has_blossom_js}")
        
        # 2. SPA XHR to /p/dashboard - should return content template
        resp = c.get('/p/dashboard', headers={'X-Requested-With': 'blossom-spa'})
        body = resp.data.decode('utf-8', errors='replace')
        has_main_class = 'class="main-content"' in body or "class='main-content'" in body
        has_main_tag = '<main' in body
        print(f"\n[SPA /p/dashboard] status={resp.status_code} len={len(body)}")
        print(f"  has <main: {has_main_tag}")
        print(f"  has class=\"main-content\": {has_main_class}")
        
        # Find main tag
        import re
        main_matches = re.findall(r'<main[^>]*>', body)
        print(f"  <main> tags: {main_matches[:5]}")
        
        # Check if it's the actual dashboard content
        if 'dashboard' in body.lower()[:2000]:
            print("  Contains dashboard content in first 2000 chars")
        
        # Show first 500 chars of body
        print(f"\n  Body start: {body[:500]}")
        
        # 3. Direct visit to /dashboard (non-SPA route)
        resp = c.get('/dashboard')
        body = resp.data.decode('utf-8', errors='replace')
        print(f"\n[/dashboard] status={resp.status_code} len={len(body)}")
        has_spa_boot2 = 'data-spa-boot' in body
        print(f"  has data-spa-boot: {has_spa_boot2}")
        if resp.status_code == 302:
            print(f"  Location: {resp.headers.get('Location')}")
        
        # 4. Check needs_terms
        from app.models import AuthUser
        user = AuthUser.query.filter_by(emp_no='admin').first()
        print(f"\n[needs_terms] {user.needs_terms()}")
        print(f"  last_terms_accepted_at: {user.last_terms_accepted_at}")
PYEOF
REMOTE
