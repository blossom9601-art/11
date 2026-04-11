#!/bin/bash
sshpass -p '123456' ssh -o StrictHostKeyChecking=no root@192.168.56.105 << 'ENDSSH'

python3 -c "
import requests, json
s = requests.Session()
s.verify = False

# Login
r = s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})
print('Login:', r.status_code, '->', r.headers.get('Location',''))

# 1) Dashboard API
print()
print('=== Dashboard API ===')
r = s.get('https://192.168.56.105/api/dashboard/stats?range=1m')
d = r.json()
print('Status:', r.status_code)
print('Success:', d.get('success'))
print('KPI keys:', list(d.get('kpi',{}).keys()))

# 2) Hardware onpremise assets API  
print()
print('=== Hardware Assets API ===')
r = s.get('https://192.168.56.105/api/hardware/onpremise/assets')
print('Status:', r.status_code)
try:
    d = r.json()
    print('Success:', d.get('success'))
    print('Total:', d.get('total'))
    if d.get('error'):
        print('Error:', d.get('error'))
except:
    print('Response:', r.text[:300])

# 3) SPA content delivery (CSP check)
print()
print('=== SPA Content Check ===')
r = s.get('https://192.168.56.105/p/dashboard', headers={'X-Requested-With':'blossom-spa'})
csp = r.headers.get('Content-Security-Policy','')
print('Status:', r.status_code)
print('Content length:', len(r.text))
has_dup_csp = csp.count('default-src') > 1
print('Duplicate CSP:', has_dup_csp)
print('Has unsafe-inline:', 'unsafe-inline' in csp)
print('Has unsafe-eval:', 'unsafe-eval' in csp)
has_dashboard = 'dashboard-sections' in r.text
print('Has dashboard content:', has_dashboard)

# 4) SPA shell (initial page load)
print()
print('=== SPA Shell Check ===')
r = s.get('https://192.168.56.105/p/dashboard')
csp = r.headers.get('Content-Security-Policy','')
print('Status:', r.status_code)
has_boot = 'data-spa-boot' in r.text
print('Has SPA boot:', has_boot)
print('Duplicate CSP:', csp.count('default-src') > 1)
" 2>/dev/null

echo ""
echo "=== Journal errors (last 20 lines) ==="
journalctl -u lumina-web --no-pager -n 20 --since '2 minutes ago' 2>/dev/null | grep -v 'Started\|Active:\|Loaded:' | tail -10
ENDSSH
