"""QA: API endpoint status check"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app import create_app
app = create_app('testing')

tests = [
    ('/api/hardware/assets?scope=onpremise', 'HW-OnPremise'),
    ('/api/hardware/assets?scope=cloud', 'HW-Cloud'),
    ('/api/hardware/assets?scope=storage', 'HW-Storage'),
    ('/api/hardware/assets?scope=san_director', 'HW-SAN-Dir'),
    ('/api/hardware/assets?scope=l2', 'HW-L2'),
    ('/api/hardware/assets?scope=firewall', 'HW-FW'),
    ('/api/governance/backup/policies', 'GOV-Backup'),
    ('/api/network/ip', 'NET-IP'),
    ('/api/network/dns', 'NET-DNS'),
    ('/api/network/vpn-lines', 'NET-VPN'),
    ('/api/network/dedicated-lines', 'NET-DL'),
    ('/api/gov-unused/assets', 'GOV-Unused'),
    ('/api/datacenter/access/controls', 'DC-Access'),
    ('/api/datacenter/access/records', 'DC-Records'),
    ('/api/datacenter/data-deletion', 'DC-Deletion'),
    ('/api/org-racks', 'DC-Racks'),
    ('/api/org-thermometers', 'DC-Thermo'),
    ('/api/org-cctvs', 'DC-CCTV'),
    ('/api/opex-dashboard', 'OPEX-Dash'),
    ('/api/opex-contracts', 'OPEX-Cont'),
    ('/api/capex-dashboard', 'CAPEX-Dash'),
    ('/api/capex-contracts', 'CAPEX-Cont'),
    ('/api/prj/projects', 'PRJ'),
    ('/api/tasks', 'TASK'),
    ('/api/tickets', 'TICKET'),
    ('/api/wf-designs', 'WF-Design'),
    ('/api/insight/articles?category=trend', 'INS-Trend'),
    ('/api/insight/blog/posts', 'INS-Blog'),
    ('/api/work-categories', 'CAT-Work'),
    ('/api/work-groups', 'CAT-WrkGrp'),
    ('/api/hw-server-types', 'CAT-HW-Srv'),
    ('/api/sw-os-types', 'CAT-SW-OS'),
    ('/api/cmp-cpu-types', 'CAT-CPU'),
    ('/api/org-companies', 'CAT-Company'),
    ('/api/org-departments', 'CAT-Dept'),
    ('/api/customer-clients', 'CAT-Customer'),
    ('/api/vendor-manufacturers', 'CAT-VendorMfr'),
    ('/api/vendor-maintenance', 'CAT-VendorMnt'),
    ('/api/dashboard/stats', 'Dashboard'),
    ('/api/users', 'Users'),
    ('/api/menus', 'Menus'),
    ('/api/session/me', 'Session'),
    ('/api/thermometer-logs', 'ThermLog'),
    ('/api/cost-contract-lines', 'CostLines'),
    ('/api/info-messages', 'InfoMsg'),
    ('/api/release-notes', 'ReleaseNotes'),
    ('/api/version', 'Version'),
]

with app.test_client() as c:
    c.post('/auth/login', data={'user_id':'admin','password':'admin'})
    
    ok = 0
    fail = 0
    for url, label in tests:
        r = c.get(url)
        status = r.status_code
        info = ''
        if status == 200:
            d = r.get_json()
            if isinstance(d, dict):
                info = f'success={d.get("success","?")}, total={d.get("total","?")}'
            elif isinstance(d, list):
                info = f'list({len(d)})'
        mark = 'OK' if status == 200 else 'FAIL'
        if mark == 'OK':
            ok += 1
        else:
            fail += 1
        print(f'{mark:4s} {status} {label:20s} {info}')
    
    print(f'\nSUMMARY: OK={ok}, FAIL={fail}')
    
    # Now test CRUD on hardware assets
    print('\n=== HARDWARE CRUD TEST ===')
    # CREATE
    resp = c.post('/api/hardware/assets', json={
        'hostname': 'QA_TEST_SRV_001',
        'asset_category': 'onpremise',
        'ip_address': '10.99.99.1',
        'status': 'active'
    })
    print(f'CREATE: {resp.status_code}')
    cid = None
    if resp.status_code in (200, 201):
        d = resp.get_json()
        print(f'  data keys: {list(d.keys()) if isinstance(d, dict) else type(d)}')
        if isinstance(d, dict):
            item = d.get('item') or d.get('asset') or d.get('data') or {}
            cid = item.get('id') or item.get('asset_id') or d.get('id')
            print(f'  created_id: {cid}')
    
    if cid:
        # READ
        resp = c.get(f'/api/hardware/assets/{cid}')
        print(f'READ: {resp.status_code}')
        
        # UPDATE
        resp = c.put(f'/api/hardware/assets/{cid}', json={'status': 'maintenance'})
        print(f'UPDATE: {resp.status_code}')
        
        # DELETE
        resp = c.post('/api/hardware/assets/bulk-delete', json={'ids': [cid]})
        print(f'DELETE: {resp.status_code}')
    
    # Test CRUD on categories
    print('\n=== CATEGORY CRUD TEST (work-categories) ===')
    resp = c.post('/api/work-categories', json={'name': 'QA_TEST_CAT', 'code': 'QA_TEST'})
    print(f'CREATE: {resp.status_code}')
    if resp.status_code == 200:
        d = resp.get_json()
        print(f'  response: {d}')
        cid = None
        if isinstance(d, dict):
            item = d.get('item') or d.get('category') or d.get('data') or {}
            cid = item.get('id') or item.get('category_id') or d.get('id')
        if cid:
            resp = c.put(f'/api/work-categories/{cid}', json={'name': 'QA_TEST_CAT_MOD'})
            print(f'UPDATE: {resp.status_code}')
            resp = c.post('/api/work-categories/bulk-delete', json={'ids': [cid]})
            print(f'DELETE: {resp.status_code}')
    
    # Test CRUD on org-companies
    print('\n=== ORG COMPANIES CRUD TEST ===')
    resp = c.post('/api/org-companies', json={'name': 'QA테스트회사', 'code': 'QA001'})
    print(f'CREATE: {resp.status_code}')
    if resp.status_code == 200:
        d = resp.get_json()
        print(f'  response: {d}')
        cid = None
        if isinstance(d, dict):
            item = d.get('item') or d.get('company') or d.get('data') or {}
            cid = item.get('id') or item.get('company_id') or d.get('id')
        if cid:
            resp = c.put(f'/api/org-companies/{cid}', json={'name': 'QA테스트회사MOD'})
            print(f'UPDATE: {resp.status_code}')
            resp = c.post('/api/org-companies/bulk-delete', json={'ids': [cid]})
            print(f'DELETE: {resp.status_code}')

    # Test vendor-manufacturers CRUD  
    print('\n=== VENDOR MANUFACTURERS CRUD TEST ===')
    resp = c.post('/api/vendor-manufacturers', json={'name': 'QA테스트벤더', 'code': 'QA_VND'})
    print(f'CREATE: {resp.status_code}')
    if resp.status_code in (200, 201):
        d = resp.get_json()
        cid = None
        if isinstance(d, dict):
            item = d.get('item') or d.get('vendor') or d
            cid = item.get('id') or item.get('vendor_id')
            print(f'  created_id: {cid}')
        if cid:
            resp = c.get(f'/api/vendor-manufacturers/{cid}')
            print(f'READ: {resp.status_code}')
            resp = c.put(f'/api/vendor-manufacturers/{cid}', json={'name': 'QA테스트벤더MOD'})
            print(f'UPDATE: {resp.status_code}')
            resp = c.post('/api/vendor-manufacturers/bulk-delete', json={'ids': [cid]})
            print(f'DELETE: {resp.status_code}')
