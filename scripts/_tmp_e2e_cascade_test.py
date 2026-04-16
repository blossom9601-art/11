"""E2E test: Create security/SAN/network/storage type -> verify hw_server_type backfill via create
-> Delete -> verify cascade deletes hw_server_type row too -> verify dashboard = 0"""
import requests, sqlite3, os, sys

BASE = 'http://127.0.0.1:8080'
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'instance', 'dev_blossom.db')
DB_PATH = os.path.abspath(DB_PATH)

session = requests.Session()
# Login
r = session.post(f'{BASE}/login', data={'login_id': 'admin', 'password': 'admin'}, allow_redirects=False)
assert r.status_code in (200, 302), f'Login failed: {r.status_code} {r.text[:200]}'

def db_count(table, code_col=None, code_val=None):
    conn = sqlite3.connect(DB_PATH)
    if code_col and code_val:
        c = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {code_col} = ?", (code_val,)).fetchone()[0]
    else:
        c = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE is_deleted = 0").fetchone()[0]
    conn.close()
    return c

def dashboard_total():
    r = session.get(f'{BASE}/api/category/hw-dashboard')
    data = r.json()
    return data.get('summary', {}).get('total', -1)

results = []

# --- Test 1: Security type ---
print("\n=== Test 1: Security Type (보안장비) ===")
try:
    payload = {
        'security_code': 'TEST-SEC-CASCADE',
        'model_name': 'Test Security Device',
        'manufacturer_name': 'Cisco',
        'security_type': 'Firewall'
    }
    r = session.post(f'{BASE}/api/hw-security-types', json=payload)
    assert r.status_code == 201, f'Create failed: {r.status_code} {r.text[:200]}'
    sec_id = r.json()['item']['id']
    
    # Check hw_server_type was created via _sync
    hw_count = db_count('hw_server_type', 'server_code', 'TEST-SEC-CASCADE')
    print(f'  Created security type id={sec_id}, hw_server_type count for code: {hw_count}')
    assert hw_count >= 1, 'hw_server_type row NOT created by _sync!'
    
    # Delete
    r = session.post(f'{BASE}/api/hw-security-types/bulk-delete', json={'ids': [sec_id]})
    assert r.status_code == 200, f'Delete failed: {r.status_code}'
    
    # Check cascade: hw_server_type should also be deleted
    hw_count_after = db_count('hw_server_type', 'server_code', 'TEST-SEC-CASCADE')
    print(f'  After delete: hw_server_type count: {hw_count_after}')
    assert hw_count_after == 0, f'CASCADE FAILED! hw_server_type still has {hw_count_after} rows'
    
    results.append(('Security cascade', 'PASS'))
except Exception as e:
    results.append(('Security cascade', f'FAIL: {e}'))
    print(f'  ERROR: {e}')

# --- Test 2: SAN type ---
print("\n=== Test 2: SAN Type ===")
try:
    payload = {
        'san_code': 'TEST-SAN-CASCADE',
        'model_name': 'Test SAN',
        'manufacturer_name': 'Cisco',
        'san_type': 'FC-SAN'
    }
    r = session.post(f'{BASE}/api/hw-san-types', json=payload)
    assert r.status_code == 201, f'Create failed: {r.status_code} {r.text[:200]}'
    san_id = r.json()['item']['id']
    
    hw_count = db_count('hw_server_type', 'server_code', 'TEST-SAN-CASCADE')
    print(f'  Created SAN type id={san_id}, hw_server_type count: {hw_count}')
    assert hw_count >= 1, 'hw_server_type row NOT created by _sync!'
    
    r = session.post(f'{BASE}/api/hw-san-types/bulk-delete', json={'ids': [san_id]})
    assert r.status_code == 200, f'Delete failed: {r.status_code}'
    
    hw_count_after = db_count('hw_server_type', 'server_code', 'TEST-SAN-CASCADE')
    print(f'  After delete: hw_server_type count: {hw_count_after}')
    assert hw_count_after == 0, f'CASCADE FAILED! hw_server_type still has {hw_count_after} rows'
    
    results.append(('SAN cascade', 'PASS'))
except Exception as e:
    results.append(('SAN cascade', f'FAIL: {e}'))
    print(f'  ERROR: {e}')

# --- Test 3: Network type ---
print("\n=== Test 3: Network Type (네트워크) ===")
try:
    payload = {
        'network_code': 'TEST-NET-CASCADE',
        'model_name': 'Test Switch',
        'manufacturer_name': 'Cisco',
        'network_type': 'L2-Switch'
    }
    r = session.post(f'{BASE}/api/hw-network-types', json=payload)
    assert r.status_code == 201, f'Create failed: {r.status_code} {r.text[:200]}'
    net_id = r.json()['item']['id']
    
    hw_count = db_count('hw_server_type', 'server_code', 'TEST-NET-CASCADE')
    print(f'  Created network type id={net_id}, hw_server_type count: {hw_count}')
    assert hw_count >= 1, 'hw_server_type row NOT created by _sync!'
    
    r = session.post(f'{BASE}/api/hw-network-types/bulk-delete', json={'ids': [net_id]})
    assert r.status_code == 200, f'Delete failed: {r.status_code}'
    
    hw_count_after = db_count('hw_server_type', 'server_code', 'TEST-NET-CASCADE')
    print(f'  After delete: hw_server_type count: {hw_count_after}')
    assert hw_count_after == 0, f'CASCADE FAILED! hw_server_type still has {hw_count_after} rows'
    
    results.append(('Network cascade', 'PASS'))
except Exception as e:
    results.append(('Network cascade', f'FAIL: {e}'))
    print(f'  ERROR: {e}')

# --- Test 4: Storage type ---
print("\n=== Test 4: Storage Type (스토리지) ===")
try:
    payload = {
        'storage_code': 'TEST-STG-CASCADE',
        'model_name': 'Test Storage',
        'manufacturer_name': 'Cisco',
        'storage_type': 'Block'
    }
    r = session.post(f'{BASE}/api/hw-storage-types', json=payload)
    assert r.status_code == 201, f'Create failed: {r.status_code} {r.text[:200]}'
    stg_id = r.json()['item']['id']
    
    hw_count = db_count('hw_server_type', 'server_code', 'TEST-STG-CASCADE')
    print(f'  Created storage type id={stg_id}, hw_server_type count: {hw_count}')
    assert hw_count >= 1, 'hw_server_type row NOT created by _sync!'
    
    r = session.post(f'{BASE}/api/hw-storage-types/bulk-delete', json={'ids': [stg_id]})
    assert r.status_code == 200, f'Delete failed: {r.status_code}'
    
    hw_count_after = db_count('hw_server_type', 'server_code', 'TEST-STG-CASCADE')
    print(f'  After delete: hw_server_type count: {hw_count_after}')
    assert hw_count_after == 0, f'CASCADE FAILED! hw_server_type still has {hw_count_after} rows'
    
    results.append(('Storage cascade', 'PASS'))
except Exception as e:
    results.append(('Storage cascade', f'FAIL: {e}'))
    print(f'  ERROR: {e}')

# --- Test 5: Dashboard should be clean ---
print("\n=== Test 5: Dashboard total ===")
try:
    total = dashboard_total()
    print(f'  Dashboard total: {total}')
    results.append(('Dashboard clean', 'PASS' if total == 0 else f'WARN: total={total}'))
except Exception as e:
    results.append(('Dashboard clean', f'FAIL: {e}'))

# --- Test 6: Backfill no longer runs on list ---
print("\n=== Test 6: List does NOT re-create hw_server_type ===")
try:
    # Create a security type, delete it (with cascade), then list - should NOT recreate
    payload = {
        'security_code': 'TEST-NOREGEN',
        'model_name': 'No Regen',
        'manufacturer_name': 'Cisco',
        'security_type': 'IPS'
    }
    r = session.post(f'{BASE}/api/hw-security-types', json=payload)
    assert r.status_code == 201
    tmp_id = r.json()['item']['id']
    
    # Delete
    r = session.post(f'{BASE}/api/hw-security-types/bulk-delete', json={'ids': [tmp_id]})
    assert r.status_code == 200

    hw_before = db_count('hw_server_type', 'server_code', 'TEST-NOREGEN')
    assert hw_before == 0, f'After delete hw_server_type should be 0, got {hw_before}'
    
    # Now list security types - should NOT resurrect the hw_server_type row 
    r = session.get(f'{BASE}/api/hw-security-types')
    assert r.status_code == 200
    
    hw_after = db_count('hw_server_type', 'server_code', 'TEST-NOREGEN')
    print(f'  After list: hw_server_type count for TEST-NOREGEN: {hw_after}')
    assert hw_after == 0, f'BACKFILL RESURRECTED DELETED ROW! count={hw_after}'
    
    results.append(('No regen on list', 'PASS'))
except Exception as e:
    results.append(('No regen on list', f'FAIL: {e}'))
    print(f'  ERROR: {e}')

# --- Summary ---
print("\n" + "=" * 50)
print("SUMMARY:")
for name, status in results:
    icon = "✓" if 'PASS' in status else "✗"
    print(f"  {icon} {name}: {status}")

passed = sum(1 for _, s in results if 'PASS' in s)
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
