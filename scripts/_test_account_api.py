"""Test account API"""
from app import create_app
app = create_app()
with app.test_client() as c:
    c.post('/api/login', json={'username': 'admin', 'password': 'admin'})
    
    # Test account list
    r = c.get('/api/asset-accounts?asset_scope=onpremise&asset_id=27&system_key=HARDWARE-SERVER')
    d = r.get_json()
    print(f"Status: {r.status_code}")
    print(f"Success: {d.get('success')}")
    print(f"Items count: {len(d.get('items', []))}")
    for it in d.get('items', [])[:3]:
        print(f"  {it.get('account_name')} / {it.get('account_type')}")
    
    # What does the subtitle actually show?
    # Test with page subtitle (same as system_name in hardware table)
    print()
    r2 = c.get('/api/asset-accounts?asset_scope=onpremise&asset_id=27&system_key=HARDWARE-SERVER')
    d2 = r2.get_json()
    print(f"system_key='HARDWARE-SERVER': {d2.get('success')}, items={len(d2.get('items', []))}")
