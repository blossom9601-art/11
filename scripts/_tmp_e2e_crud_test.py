"""
E2E CRUD test: Create → Dashboard check → Delete → Dashboard check → DB verify
Tests against local Flask server at http://127.0.0.1:8080
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
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
    except Exception as e:
        return 0, {'error': str(e)}

def dashboard_total():
    status, data = api('GET', '/api/category/hw-dashboard')
    summary = data.get('summary', data.get('data', {}).get('summary', {}))
    return summary.get('total', -1)

def db_count(tbl='hw_server_type'):
    conn = sqlite3.connect('instance/dev_blossom.db')
    n = conn.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0]
    conn.close()
    return n

print('=== Step 0: Initial state ===')
print(f'  Dashboard total: {dashboard_total()}')
print(f'  DB hw_server_type count: {db_count()}')

print('\n=== Step 1: Create test server type ===')
create_data = {
    'model_name': 'E2E-TEST-DELETE-ME',
    'manufacturer_code': 'HPE',
    'form_factor': '서버',
    'eosl_date': '2030-12-31',
}
status, resp = api('POST', '/api/hw-server-types', create_data)
print(f'  POST status: {status}')
created_id = None
if status in (200, 201):
    item = resp.get('item') or resp
    created_id = item.get('id')
    print(f'  Created id: {created_id}')
    print(f'  Dashboard total: {dashboard_total()}')
    print(f'  DB count: {db_count()}')
else:
    print(f'  FAILED: {resp}')

if created_id:
    print('\n=== Step 2: Delete via bulk-delete ===')
    del_status, del_resp = api('POST', '/api/hw-server-types/bulk-delete', {'ids': [created_id]})
    print(f'  POST bulk-delete status: {del_status}')
    print(f'  Response: {del_resp}')

    print('\n=== Step 3: Post-delete verification ===')
    print(f'  Dashboard total: {dashboard_total()}')
    db_n = db_count()
    print(f'  DB count: {db_n}')

    # Also check if the row is actually gone (not just soft-deleted)
    conn = sqlite3.connect('instance/dev_blossom.db')
    row = conn.execute('SELECT id, is_deleted FROM hw_server_type WHERE id = ?', (created_id,)).fetchone()
    conn.close()
    if row is None:
        print(f'  Row id={created_id}: PHYSICALLY DELETED (correct!)')
    else:
        print(f'  Row id={created_id}: STILL EXISTS is_deleted={row[1]} (BUG!)')
else:
    print('\nSKIPPED delete test - create failed')

print('\n=== Summary ===')
final_dash = dashboard_total()
final_db = db_count()
print(f'  Dashboard total: {final_dash}')
print(f'  DB count: {final_db}')
if final_dash == final_db == 0:
    print('  PASS: Dashboard and DB both show 0')
elif final_dash == final_db:
    print(f'  PASS: Dashboard and DB match ({final_dash})')
else:
    print(f'  FAIL: Dashboard ({final_dash}) != DB ({final_db})')
