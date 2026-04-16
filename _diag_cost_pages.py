"""Diagnose OPEX/CAPEX page loading issues"""
import requests, re, os

s = requests.Session()
s.post('http://localhost:8080/login', data={'employee_id': 'admin', 'password': 'admin1234!'})

pages = {
    'cost_opex_hardware': 'OPEX HW list',
    'cost_opex_software': 'OPEX SW list',
    'cost_opex_etc': 'OPEX ETC list',
    'cost_capex_contract': 'CAPEX contract list',
}

for key, label in pages.items():
    r = s.get(f'http://localhost:8080/p/{key}', headers={'X-Requested-With': 'blossom-spa'}, timeout=10)
    body = r.text
    
    # Find all script src and link href
    scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)', body)
    styles = re.findall(r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)', body)
    
    print(f'\n=== {label} ({key}) ===')
    print(f'  status={r.status_code} len={len(body)}')
    
    missing = []
    for url in scripts + styles:
        if url.startswith('/'):
            path = url.split('?')[0]
            r2 = s.get(f'http://localhost:8080{path}', timeout=5)
            if r2.status_code != 200:
                missing.append(f'{url} -> {r2.status_code}')
    
    if missing:
        print('  MISSING RESOURCES:')
        for m in missing:
            print(f'    {m}')
    else:
        print('  All resources OK')
    
    # Check if key elements exist
    has_main = 'main-content' in body
    has_table = 'system-table-body' in body
    has_modal = 'system-add-modal' in body or 'system-delete-modal' in body
    print(f'  main={has_main} table={has_table} modal={has_modal}')

# Also check the OPEX API  
for api in ['/api/opex-contracts?opex_type=HW', '/api/opex-contracts?opex_type=SW', '/api/opex-contracts?opex_type=ETC', '/api/capex-contracts']:
    r = s.get(f'http://localhost:8080{api}', timeout=5)
    print(f'\nAPI {api}: {r.status_code}')
    if r.status_code == 200:
        try:
            j = r.json()
            print(f'  success={j.get("success")} rows={len(j.get("rows", []))} total={j.get("total", "?")}')
        except:
            print(f'  Not JSON: {r.text[:200]}')
    else:
        print(f'  Error: {r.text[:200]}')
