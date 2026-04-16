"""
Re-test the 4 failed items with correct payloads,
plus customer/vendor which weren't in the first batch.
"""
import urllib.request
import json
import sqlite3

BASE = 'http://127.0.0.1:8080'

def api(method, path, data=None):
    url = f'{BASE}{path}'
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except:
            body = {}
        return e.code, body
    except Exception as e:
        return 0, {'error': str(e)}

def db_exists(tbl, row_id, db='instance/dev_blossom.db'):
    # Some tables are in separate DB files
    DB_MAP = {
        'biz_customer_member': 'instance/customer_member.db',
        'biz_customer_associate': 'instance/customer_associate.db',
        'biz_customer_client': 'instance/customer_client.db',
    }
    actual_db = DB_MAP.get(tbl, db)
    conn = sqlite3.connect(actual_db)
    row = conn.execute(f'SELECT id FROM {tbl} WHERE id = ?', (row_id,)).fetchone()
    conn.close()
    return row is not None

TESTS = [
    # Fix: SAN (need to check response format)
    ('SAN유형', '/api/hw-san-types', '/api/hw-san-types/bulk-delete',
     {'model_name': 'E2E-SAN-V2', 'manufacturer_code': 'HPE', 'san_type': 'SAN 디렉터'}, 'hw_san_type'),

    # Fix: Virtual/Security SW/HA with correct required fields
    ('가상화유형', '/api/sw-virtual-types', '/api/sw-virtual-types/bulk-delete',
     {'virtual_name': 'E2E-VM', 'virtual_family': 'Hypervisor', 'model_name': 'E2E-VM',
      'manufacturer_code': 'HPE', 'virtual_type': 'Hypervisor'}, 'sw_virtual_type'),
    ('보안SW유형', '/api/sw-security-types', '/api/sw-security-types/bulk-delete',
     {'secsw_name': 'E2E-보안SW', 'secsw_family': 'AV', 'model_name': 'E2E-보안SW',
      'manufacturer_code': 'HPE', 'security_type': 'AV'}, 'sw_security_sw_type'),
    ('HA유형', '/api/sw-ha-types', '/api/sw-ha-types/bulk-delete',
     {'ha_name': 'E2E-HA', 'ha_mode': 'Active-Active', 'model_name': 'E2E-HA',
      'manufacturer_code': 'HPE', 'ha_type': 'Cluster'}, 'sw_ha_type'),

    # Customer
    ('고객사', '/api/customer-clients', '/api/customer-clients/bulk-delete',
     {'client_name': 'E2E-고객사', 'client_type': '일반'}, 'biz_customer_client'),
    ('회원사', '/api/customer-members', '/api/customer-members/bulk-delete',
     {'member_name': 'E2E-회원사', 'member_type': '일반'}, 'biz_customer_member'),
    ('준회원사', '/api/customer-associates', '/api/customer-associates/bulk-delete',
     {'associate_name': 'E2E-준회원', 'associate_type': '일반'}, 'biz_customer_associate'),
]

results = []

for name, create_ep, delete_ep, payload, db_table in TESTS:
    # Create
    status, resp = api('POST', create_ep, payload)
    if status not in (200, 201):
        results.append((name, 'CREATE_FAIL', status, resp.get('message', resp.get('error', str(resp)[:80]))))
        continue

    # Find id - try multiple response shapes
    item = resp.get('item') or resp
    item_id = None
    if item and isinstance(item, dict):
        item_id = item.get('id')
    if not item_id and resp.get('id'):
        item_id = resp.get('id')

    # For SAN which returns item=None, try listing
    if not item_id:
        list_status, list_data = api('GET', create_ep + '?page=1&per_page=1')
        rows = list_data.get('rows') or list_data.get('items') or []
        if rows:
            item_id = rows[0].get('id')
            print(f'  [{name}] Found via list: id={item_id}')

    if not item_id:
        results.append((name, 'NO_ID', status, str(resp)[:100]))
        continue

    # Delete
    del_status, del_resp = api('POST', delete_ep, {'ids': [item_id]})
    if del_status != 200:
        results.append((name, 'DELETE_FAIL', del_status, str(del_resp)[:80]))
        continue

    # Verify
    if db_exists(db_table, item_id):
        results.append((name, 'NOT_DELETED', 200, f'id={item_id} still in DB'))
    else:
        results.append((name, 'PASS', 200, ''))

print('\n=== E2E CRUD Test Results (Round 2) ===')
passed = 0
failed = 0
for name, result, status, detail in results:
    if result == 'PASS':
        passed += 1
        print(f'  [OK] {name}')
    else:
        failed += 1
        print(f'  [FAIL] {name}: {result} (HTTP {status}) {detail}')

print(f'\nTotal: {passed} passed, {failed} failed out of {len(results)} tests')
