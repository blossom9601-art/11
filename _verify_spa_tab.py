"""Verify OPEX/CAPEX pages render correctly for SPA tab swap fix."""
import requests

s = requests.Session()
s.post('http://localhost:8080/api/auth/login', json={'user_id': 'admin', 'password': 'admin'})

pages = [
    ('cost_opex_dashboard', '.exec-dashboard'),
    ('cost_opex_hardware', '.tab-content'),
    ('cost_opex_software', '.tab-content'),
    ('cost_opex_etc', '.tab-content'),
    ('cost_capex_dashboard', '.exec-dashboard'),
    ('cost_capex_contract', '.tab-content'),
]

for key, marker in pages:
    r = s.get(f'http://localhost:8080/p/{key}', headers={'X-Requested-With': 'XMLHttpRequest'})
    has_marker = marker in r.text
    # check blossom.js version
    has_new_ver = '20260412_spa_tab' in r.text
    print(f'{key:30s}  status={r.status_code}  marker={has_marker}  js_ver={has_new_ver}')

# Check that the blossom.js fix is present
r2 = s.get('http://localhost:8080/static/js/blossom.js')
has_fix = 'data 속성 동기화' in r2.text
print(f'\nblossom.js has fix: {has_fix}')
