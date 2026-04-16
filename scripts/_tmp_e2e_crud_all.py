"""
E2E CRUD test across ALL category domains:
Create → Delete (bulk-delete) → Verify DB row physically gone
"""
import urllib.request
import json
import sqlite3
import time

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
    conn = sqlite3.connect(db)
    row = conn.execute(f'SELECT id FROM {tbl} WHERE id = ?', (row_id,)).fetchone()
    conn.close()
    return row is not None

# Each test case: (name, create_endpoint, delete_endpoint, create_payload, db_table, id_field)
TESTS = [
    # Hardware
    ('서버유형', '/api/hw-server-types', '/api/hw-server-types/bulk-delete',
     {'model_name': 'E2E-서버', 'manufacturer_code': 'HPE', 'form_factor': '서버'}, 'hw_server_type', 'id'),
    ('스토리지유형', '/api/hw-storage-types', '/api/hw-storage-types/bulk-delete',
     {'model_name': 'E2E-스토리지', 'manufacturer_code': 'HPE', 'storage_type': '스토리지'}, 'hw_storage_type', 'id'),
    ('SAN유형', '/api/hw-san-types', '/api/hw-san-types/bulk-delete',
     {'model_name': 'E2E-SAN', 'manufacturer_code': 'HPE', 'san_type': 'SAN 디렉터'}, 'hw_san_type', 'id'),
    ('네트워크유형', '/api/hw-network-types', '/api/hw-network-types/bulk-delete',
     {'model_name': 'E2E-네트워크', 'manufacturer_code': 'HPE', 'network_type': 'L2'}, 'hw_network_type', 'id'),
    ('보안장비유형', '/api/hw-security-types', '/api/hw-security-types/bulk-delete',
     {'model_name': 'E2E-보안', 'manufacturer_code': 'HPE', 'security_type': 'FW'}, 'hw_security_type', 'id'),

    # Software
    ('OS유형', '/api/sw-os-types', '/api/sw-os-types/bulk-delete',
     {'model_name': 'E2E-OS', 'manufacturer_code': 'HPE', 'os_type': 'Linux'}, 'sw_os_type', 'id'),
    ('DB유형', '/api/sw-db-types', '/api/sw-db-types/bulk-delete',
     {'model_name': 'E2E-DB', 'manufacturer_code': 'HPE', 'db_type': 'RDBMS'}, 'sw_db_type', 'id'),
    ('미들웨어유형', '/api/sw-middleware-types', '/api/sw-middleware-types/bulk-delete',
     {'model_name': 'E2E-MW', 'manufacturer_code': 'HPE', 'middleware_type': 'WAS'}, 'sw_middleware_type', 'id'),
    ('가상화유형', '/api/sw-virtual-types', '/api/sw-virtual-types/bulk-delete',
     {'model_name': 'E2E-VM', 'manufacturer_code': 'HPE', 'virtual_type': 'Hypervisor'}, 'sw_virtual_type', 'id'),
    ('보안SW유형', '/api/sw-security-types', '/api/sw-security-types/bulk-delete',
     {'model_name': 'E2E-보안SW', 'manufacturer_code': 'HPE', 'security_type': 'AV'}, 'sw_security_sw_type', 'id'),
    ('HA유형', '/api/sw-ha-types', '/api/sw-ha-types/bulk-delete',
     {'model_name': 'E2E-HA', 'manufacturer_code': 'HPE', 'ha_type': 'Cluster'}, 'sw_ha_type', 'id'),

    # Component
    ('CPU유형', '/api/cmp-cpu-types', '/api/cmp-cpu-types/bulk-delete',
     {'model_name': 'E2E-CPU', 'manufacturer_code': 'HPE', 'cpu_type': 'x86'}, 'cmp_cpu_type', 'id'),
    ('GPU유형', '/api/cmp-gpu-types', '/api/cmp-gpu-types/bulk-delete',
     {'model_name': 'E2E-GPU', 'manufacturer_code': 'HPE', 'gpu_type': 'Gaming'}, 'cmp_gpu_type', 'id'),
    ('메모리유형', '/api/cmp-memory-types', '/api/cmp-memory-types/bulk-delete',
     {'model_name': 'E2E-MEM', 'manufacturer_code': 'HPE', 'memory_type': 'DDR4'}, 'cmp_memory_type', 'id'),
    ('디스크유형', '/api/cmp-disk-types', '/api/cmp-disk-types/bulk-delete',
     {'model_name': 'E2E-DISK', 'manufacturer_code': 'HPE', 'disk_type': 'SSD'}, 'cmp_disk_type', 'id'),
    ('NIC유형', '/api/cmp-nic-types', '/api/cmp-nic-types/bulk-delete',
     {'model_name': 'E2E-NIC', 'manufacturer_code': 'HPE', 'nic_type': '1GbE'}, 'cmp_nic_type', 'id'),
    ('HBA유형', '/api/cmp-hba-types', '/api/cmp-hba-types/bulk-delete',
     {'model_name': 'E2E-HBA', 'manufacturer_code': 'HPE', 'hba_type': 'FC'}, 'cmp_hba_type', 'id'),
    ('기타유형', '/api/cmp-etc-types', '/api/cmp-etc-types/bulk-delete',
     {'model_name': 'E2E-ETC', 'manufacturer_code': 'HPE', 'etc_type': 'ETC'}, 'cmp_etc_type', 'id'),

    # Business
    ('업무분류', '/api/work-categories', '/api/work-categories/bulk-delete',
     {'category_name': 'E2E-업무분류', 'description': 'test'}, 'biz_work_category', 'id'),
    ('업무구분', '/api/work-divisions', '/api/work-divisions/bulk-delete',
     {'division_name': 'E2E-업무구분', 'description': 'test'}, 'biz_work_division', 'id'),
    ('업무상태', '/api/work-statuses', '/api/work-statuses/bulk-delete',
     {'status_name': 'E2E-상태', 'description': 'test'}, 'biz_work_status', 'id'),
    ('업무운영', '/api/work-operations', '/api/work-operations/bulk-delete',
     {'operation_name': 'E2E-운영', 'description': 'test'}, 'biz_work_operation', 'id'),

    # Org
    ('회사', '/api/org-companies', '/api/org-companies/bulk-delete',
     {'company_name': 'E2E-회사', 'company_type': '협력사'}, 'org_company', 'id'),
]

results = []

for name, create_ep, delete_ep, payload, db_table, id_field in TESTS:
    # Create
    status, resp = api('POST', create_ep, payload)
    if status not in (200, 201):
        results.append((name, 'CREATE_FAIL', status, resp.get('message', resp.get('error', ''))))
        continue

    item = resp.get('item') or resp
    item_id = item.get(id_field)
    if not item_id:
        results.append((name, 'NO_ID', status, str(item)[:80]))
        continue

    # Verify exists in DB
    if not db_exists(db_table, item_id):
        results.append((name, 'CREATE_NOT_IN_DB', status, f'id={item_id}'))
        continue

    # Delete
    del_status, del_resp = api('POST', delete_ep, {'ids': [item_id]})
    if del_status != 200:
        results.append((name, 'DELETE_FAIL', del_status, str(del_resp)[:80]))
        continue

    # Verify physically deleted
    if db_exists(db_table, item_id):
        results.append((name, 'NOT_DELETED', 200, f'id={item_id} still in DB'))
    else:
        results.append((name, 'PASS', 200, ''))

print('\n=== E2E CRUD Test Results ===')
passed = 0
failed = 0
for name, result, status, detail in results:
    marker = 'OK' if result == 'PASS' else 'FAIL'
    if result == 'PASS':
        passed += 1
        print(f'  [{marker}] {name}')
    else:
        failed += 1
        print(f'  [{marker}] {name}: {result} (HTTP {status}) {detail}')

print(f'\nTotal: {passed} passed, {failed} failed out of {len(results)} tests')
