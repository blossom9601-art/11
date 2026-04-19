# -*- coding: utf-8 -*-
"""
QA Phase 2: 실제 라우트 기반 API CRUD 전수 테스트
각 도메인별 GET(목록) -> POST(생성) -> PUT(수정) -> DELETE(삭제) 흐름 검증
"""
import sys, os, json, traceback
sys.path.insert(0, os.path.dirname(__file__))
from app import create_app

app = create_app('testing')
results = []

def log(domain, method, url, status, note=''):
    results.append({'domain': domain, 'method': method, 'url': url,
                    'status': status, 'note': str(note)[:300]})

def do_get(c, domain, url):
    try:
        r = c.get(url, headers={'X-Requested-With': 'XMLHttpRequest'})
        try:
            j = json.loads(r.data)
            note = f"success={j.get('success')}, total={j.get('total','?')}, rows={len(j.get('rows',j.get('items',[])))}"
        except:
            note = f"non-json({len(r.data)}b)"
        log(domain, 'GET', url, r.status_code, note)
        return r
    except Exception as e:
        log(domain, 'GET', url, 'ERR', str(e))
        return None

def do_post(c, domain, url, data):
    try:
        r = c.post(url, json=data, headers={'X-Requested-With': 'XMLHttpRequest',
                                             'Content-Type': 'application/json'})
        try:
            j = json.loads(r.data)
            note = f"success={j.get('success')}, id={j.get('item',{}).get('id','?') if isinstance(j.get('item'),dict) else '?'}, error={j.get('error','')}"
        except:
            note = r.data.decode('utf-8','replace')[:200]
        log(domain, 'POST', url, r.status_code, note)
        return r
    except Exception as e:
        log(domain, 'POST', url, 'ERR', str(e))
        return None

def do_put(c, domain, url, data):
    try:
        r = c.put(url, json=data, headers={'X-Requested-With': 'XMLHttpRequest',
                                            'Content-Type': 'application/json'})
        try:
            j = json.loads(r.data)
            note = f"success={j.get('success')}, error={j.get('error','')}"
        except:
            note = r.data.decode('utf-8','replace')[:200]
        log(domain, 'PUT', url, r.status_code, note)
        return r
    except Exception as e:
        log(domain, 'PUT', url, 'ERR', str(e))
        return None

def do_bulk_del(c, domain, url, ids):
    try:
        r = c.post(url, json={'ids': ids}, headers={'X-Requested-With': 'XMLHttpRequest',
                                                      'Content-Type': 'application/json'})
        try:
            j = json.loads(r.data)
            note = f"success={j.get('success')}, error={j.get('error','')}"
        except:
            note = r.data.decode('utf-8','replace')[:200]
        log(domain, 'BULK-DEL', url, r.status_code, note)
        return r
    except Exception as e:
        log(domain, 'BULK-DEL', url, 'ERR', str(e))
        return None


def run_all(c):
    # ── 1. Hardware Assets ──
    # Main list endpoint
    do_get(c, 'hw_assets_list', '/api/hardware/assets')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=server&sub_scope=onpremise')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=server&sub_scope=cloud')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=server&sub_scope=frame')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=server&sub_scope=workstation')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=storage&sub_scope=san')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=storage&sub_scope=backup')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=san&sub_scope=director')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=san&sub_scope=switch')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=network&sub_scope=l2')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=network&sub_scope=l4')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=network&sub_scope=l7')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=network&sub_scope=ap')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=network&sub_scope=dedicateline')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=security&sub_scope=firewall')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=security&sub_scope=vpn')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=security&sub_scope=ids')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=security&sub_scope=ips')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=security&sub_scope=hsm')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=security&sub_scope=kms')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=security&sub_scope=wips')
    do_get(c, 'hw_assets_list', '/api/hardware/assets?scope=security&sub_scope=etc')

    # Cloud assets CRUD
    do_get(c, 'hw_cloud', '/api/hardware/cloud/assets')
    r = do_post(c, 'hw_cloud', '/api/hardware/cloud/assets', {
        'hostname': '_QA_TEST_CLOUD_01', 'ip_address': '10.99.99.1',
        'asset_category': 'server', 'asset_sub_category': 'cloud'
    })
    if r and r.status_code == 200:
        try:
            cid = json.loads(r.data).get('item',{}).get('id')
            if cid:
                do_put(c, 'hw_cloud', f'/api/hardware/cloud/assets/{cid}',
                       {'hostname': '_QA_TEST_CLOUD_01_UPDATED'})
                do_get(c, 'hw_cloud_detail', f'/api/hardware/cloud/assets/{cid}')
        except: pass

    # ── 2. Governance ──
    # Backup
    do_get(c, 'gov_backup_policy', '/api/governance/backup/target-policies')
    do_get(c, 'gov_backup_tape', '/api/governance/backup/tapes')
    do_get(c, 'gov_backup_library', '/api/governance/backup/libraries')
    do_get(c, 'gov_backup_location', '/api/governance/backup/locations')
    do_get(c, 'gov_backup_pool', '/api/governance/backup/storage-pools')

    # Package
    do_get(c, 'gov_package', '/api/governance/packages')
    do_get(c, 'gov_pkg_dashboard', '/api/governance/package-dashboard')
    do_get(c, 'gov_pkg_vuln', '/api/governance/package-vulnerabilities')

    # Vulnerability
    do_get(c, 'gov_vuln_guide', '/api/governance/vulnerability-guides')
    do_get(c, 'gov_vuln_summary', '/api/governance/vulnerability-guides/summary')

    # DR Training
    do_get(c, 'gov_dr_training', '/api/governance/dr-trainings')
    r = do_post(c, 'gov_dr_training', '/api/governance/dr-trainings', {
        'title': '_QA_DR_TEST', 'training_date': '2026-04-18',
        'description': 'QA test'
    })
    if r and r.status_code in (200, 201):
        try:
            tid = json.loads(r.data).get('item',{}).get('id')
            if tid:
                do_put(c, 'gov_dr_training', f'/api/governance/dr-trainings/{tid}',
                       {'title': '_QA_DR_TEST_UPDATED'})
                do_bulk_del(c, 'gov_dr_training', '/api/governance/dr-trainings/bulk-delete', [tid])
        except: pass

    # Network policy
    do_get(c, 'gov_net_ip', '/api/network-policies?policy_type=ip')
    do_get(c, 'gov_net_dns', '/api/network-policies?policy_type=dns')
    do_get(c, 'gov_net_ad', '/api/network-policies?policy_type=ad')

    # VPN lines
    do_get(c, 'gov_vpn_lines', '/api/vpn-lines')

    # Dedicated lines
    do_get(c, 'gov_dedicated_lines', '/api/dedicated-lines')

    # Unused assets
    do_get(c, 'gov_unused', '/api/gov-unused/assets')
    do_get(c, 'gov_unused_server', '/api/gov-unused/assets?asset_category=server')

    # ── 3. Datacenter ──
    do_get(c, 'dc_access_perm', '/api/datacenter/access/permissions')
    do_get(c, 'dc_access_entries', '/api/datacenter/access/entries')
    do_get(c, 'dc_access_records', '/api/datacenter/access/records')
    do_get(c, 'dc_authority_records', '/api/datacenter/access/authority-records')
    do_get(c, 'dc_access_systems', '/api/datacenter/access/systems')
    do_get(c, 'dc_access_zones', '/api/datacenter/access/zones')
    do_get(c, 'dc_data_deletion', '/api/datacenter/data-deletion')
    do_get(c, 'dc_data_del_sys', '/api/datacenter/data-deletion-systems')

    # Rack
    do_get(c, 'dc_racks', '/api/racks')

    # Thermometer
    do_get(c, 'dc_thermo', '/api/thermometers')

    # CCTV
    do_get(c, 'dc_cctv', '/api/cctvs')

    # ── 4. Cost ──
    do_get(c, 'cost_opex_hw', '/api/opex-items?cost_type=hardware')
    do_get(c, 'cost_opex_sw', '/api/opex-items?cost_type=software')
    do_get(c, 'cost_opex_etc', '/api/opex-items?cost_type=etc')
    do_get(c, 'cost_capex_dash', '/api/capex-dashboard')
    do_get(c, 'cost_capex_contract', '/api/capex-contracts')

    # ── 5. Project / Task / Workflow ──
    do_get(c, 'projects', '/api/projects')
    do_get(c, 'tasks', '/api/tasks')
    do_get(c, 'workflow', '/api/tickets')
    do_get(c, 'wf_designs', '/api/wf-designs')

    # ── 6. Insight ──
    do_get(c, 'insight_trend', '/api/insights?category=trend')
    do_get(c, 'insight_security', '/api/insights?category=security')
    do_get(c, 'insight_blog', '/api/blogs')

    # ── 7. Category ──
    # Business
    do_get(c, 'cat_biz_work', '/api/work-classifications')
    do_get(c, 'cat_biz_div', '/api/work-divisions')
    do_get(c, 'cat_biz_status', '/api/work-statuses')
    do_get(c, 'cat_biz_oper', '/api/work-operations')
    do_get(c, 'cat_biz_group', '/api/work-groups')

    # HW Category
    do_get(c, 'cat_hw_server', '/api/server-types')
    do_get(c, 'cat_hw_storage', '/api/storage-types')
    do_get(c, 'cat_hw_san', '/api/san-types')
    do_get(c, 'cat_hw_network', '/api/network-types')
    do_get(c, 'cat_hw_security', '/api/security-types')

    # SW Category
    do_get(c, 'cat_sw_os', '/api/sw-os-types')
    do_get(c, 'cat_sw_db', '/api/sw-database-types')
    do_get(c, 'cat_sw_mw', '/api/sw-middleware-types')
    do_get(c, 'cat_sw_virt', '/api/sw-virtualization-types')
    do_get(c, 'cat_sw_sec', '/api/sw-security-types')
    do_get(c, 'cat_sw_ha', '/api/sw-ha-types')

    # Component
    do_get(c, 'cat_cmp_cpu', '/api/cmp-cpu-types')
    do_get(c, 'cat_cmp_gpu', '/api/cmp-gpu-types')
    do_get(c, 'cat_cmp_mem', '/api/cmp-memory-types')
    do_get(c, 'cat_cmp_disk', '/api/cmp-disk-types')
    do_get(c, 'cat_cmp_nic', '/api/cmp-nic-types')
    do_get(c, 'cat_cmp_hba', '/api/cmp-hba-types')
    do_get(c, 'cat_cmp_etc', '/api/cmp-etc-types')

    # Company / Department
    do_get(c, 'cat_company', '/api/companies')
    do_get(c, 'cat_department', '/api/departments')

    # Customer
    do_get(c, 'cat_customer', '/api/customer-clients')

    # Vendor
    do_get(c, 'cat_vendor_mfr', '/api/vendor-manufacturers')
    do_get(c, 'cat_vendor_maint', '/api/vendor-maintenances')

    # ── 8. Settings ──
    do_get(c, 'settings_brand', '/api/brand-settings')
    do_get(c, 'settings_version', '/api/version')

    # ── 9. Maintenance ──
    do_get(c, 'maint_contract', '/api/maint-contracts')

    # ── 10. Other ──
    do_get(c, 'dashboard_stats', '/api/dashboard/stats')
    do_get(c, 'employees', '/api/employees')
    do_get(c, 'asset_accounts', '/api/asset-accounts')
    do_get(c, 'change_logs', '/api/change-logs')
    do_get(c, 'change_events', '/api/change-events')
    do_get(c, 'files', '/api/files')
    do_get(c, 'notifications', '/api/notifications')

    # CRUD test: Component CPU (simple model)
    r = do_post(c, 'crud_cmp_cpu', '/api/cmp-cpu-types', {
        'model_name': '_QA_CPU_TEST', 'manufacturer': 'QA_MFR',
        'cores': 8, 'speed_ghz': 3.5
    })
    if r and r.status_code in (200, 201):
        try:
            j = json.loads(r.data)
            cid = j.get('item',{}).get('id') or j.get('id')
            if cid:
                do_put(c, 'crud_cmp_cpu', f'/api/cmp-cpu-types/{cid}',
                       {'model_name': '_QA_CPU_TEST_UPDATED'})
                do_bulk_del(c, 'crud_cmp_cpu', '/api/cmp-cpu-types/bulk-delete', [cid])
        except: pass

    # CRUD test: Customer Client
    r = do_post(c, 'crud_customer', '/api/customer-clients', {
        'client_name': '_QA_CUST_TEST', 'business_type': 'IT'
    })
    if r and r.status_code in (200, 201):
        try:
            j = json.loads(r.data)
            cid = j.get('item',{}).get('id') or j.get('id')
            if cid:
                do_put(c, 'crud_customer', f'/api/customer-clients/{cid}',
                       {'client_name': '_QA_CUST_TEST_UPDATED'})
                do_bulk_del(c, 'crud_customer', '/api/customer-clients/bulk-delete', [cid])
        except: pass

    # CRUD test: Work Classification
    r = do_post(c, 'crud_work_class', '/api/work-classifications', {
        'name': '_QA_WORK_TEST'
    })
    if r and r.status_code in (200, 201):
        try:
            j = json.loads(r.data)
            wid = j.get('item',{}).get('id') or j.get('id')
            if wid:
                do_put(c, 'crud_work_class', f'/api/work-classifications/{wid}',
                       {'name': '_QA_WORK_TEST_UPDATED'})
                do_bulk_del(c, 'crud_work_class', '/api/work-classifications/bulk-delete', [wid])
        except: pass

    # CRUD test: Vendor Manufacturer
    r = do_post(c, 'crud_vendor_mfr', '/api/vendor-manufacturers', {
        'company_name': '_QA_VENDOR_TEST'
    })
    if r and r.status_code in (200, 201):
        try:
            j = json.loads(r.data)
            vid = j.get('item',{}).get('id') or j.get('id')
            if vid:
                do_put(c, 'crud_vendor_mfr', f'/api/vendor-manufacturers/{vid}',
                       {'company_name': '_QA_VENDOR_TEST_UPDATED'})
                do_bulk_del(c, 'crud_vendor_mfr', '/api/vendor-manufacturers/bulk-delete', [vid])
        except: pass


if __name__ == '__main__':
    print("=" * 80)
    print("QA Phase 2: API CRUD Test (real routes)")
    print("=" * 80)

    with app.test_client() as c:
        c.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
        run_all(c)

    ok = [r for r in results if r['status'] in (200, 201, 204)]
    fail = [r for r in results if r['status'] not in (200, 201, 204)]

    print(f"\nTotal: {len(results)} | PASS: {len(ok)} | FAIL: {len(fail)}")

    if fail:
        print(f"\n--- FAILURES ({len(fail)}) ---")
        for r in fail:
            print(f"  [{r['status']:>4}] {r['method']:8s} {r['domain']:25s} {r['url']}")
            if r['note']:
                print(f"         {r['note'][:200]}")

    print(f"\n--- ALL RESULTS ---")
    for r in results:
        mark = 'OK' if r['status'] in (200, 201, 204) else 'XX'
        print(f"  [{mark}] {r['status']:>4} {r['method']:8s} {r['domain']:25s} {r['url']}")
        if r['note']:
            print(f"         {r['note'][:200]}")
"""
QA 전수 점검 2단계: 실패 원인 분석 + API CRUD 테스트
"""
import sys, os, json, traceback
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.routes.pages import TEMPLATE_MAP

app = create_app('testing')

def investigate_failures():
    """실패 페이지 상세 원인 분석"""
    print("=" * 80)
    print("[1] 실패 페이지 원인 분석")
    print("=" * 80)
    
    fail_keys = ['hw_storage_backup_task', 'hw_storage_san_task', 'maint_contract_list']
    
    with app.test_client() as client:
        client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
        
        for key in fail_keys:
            print(f"\n--- {key} ---")
            print(f"  TEMPLATE_MAP entry: {TEMPLATE_MAP.get(key, 'NOT FOUND')}")
            try:
                resp = client.get(f'/p/{key}', headers={'X-Requested-With': 'XMLHttpRequest'})
                print(f"  HTTP Status: {resp.status_code}")
                if resp.status_code >= 400:
                    body = resp.data.decode('utf-8', errors='replace')[:500]
                    print(f"  Response body: {body}")
            except Exception as e:
                print(f"  Exception: {e}")
                traceback.print_exc()

def test_api_crud():
    """주요 메뉴별 API CRUD 테스트"""
    print("\n" + "=" * 80)
    print("[2] API CRUD 테스트")
    print("=" * 80)
    
    results = {}
    
    with app.test_client() as client:
        client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
        
        # === 시스템 - 서버 (On-Premise) ===
        api_tests = [
            # (카테고리, GET목록URL, POST생성URL, PUT수정URL패턴, DELETE URL패턴, 생성데이터)
            ('서버-OnPremise', '/api/servers', '/api/servers', {
                'hostname': 'QA_TEST_SRV001',
                'asset_category': 'onpremise',
                'ip_address': '10.0.0.99',
                'os_name': 'CentOS 7',
                'status': '운영중'
            }),
            ('서버-Cloud', '/api/servers', '/api/servers', {
                'hostname': 'QA_TEST_CLOUD001',
                'asset_category': 'cloud',
                'ip_address': '10.0.1.99',
                'os_name': 'Ubuntu 22.04',
                'status': '운영중'
            }),
            ('스토리지-SAN', '/api/storages', '/api/storages', {
                'hostname': 'QA_TEST_STG001',
                'asset_category': 'san',
                'ip_address': '10.0.2.99',
                'status': '운영중'
            }),
            ('SAN-Director', '/api/san-directors', '/api/san-directors', {
                'hostname': 'QA_TEST_SAN001',
                'ip_address': '10.0.3.99',
                'status': '운영중'
            }),
            ('네트워크-L2', '/api/network-l2s', '/api/network-l2s', {
                'hostname': 'QA_TEST_L2_001',
                'ip_address': '10.0.4.99',
                'status': '운영중'
            }),
            ('보안-Firewall', '/api/security-firewalls', '/api/security-firewalls', {
                'hostname': 'QA_TEST_FW001',
                'ip_address': '10.0.5.99',
                'status': '운영중'
            }),
        ]
        
        for name, list_url, create_url, create_data in api_tests:
            r = {'list': None, 'create': None, 'detail': None, 'update': None, 'delete': None}
            
            # LIST (GET)
            try:
                resp = client.get(list_url)
                r['list'] = f"HTTP {resp.status_code}"
                data = resp.get_json() if resp.status_code == 200 else None
                if data:
                    r['list'] += f" (success={data.get('success')}, total={data.get('total', '?')})"
            except Exception as e:
                r['list'] = f"ERROR: {e}"
            
            # CREATE (POST)
            created_id = None
            try:
                resp = client.post(create_url, json=create_data)
                r['create'] = f"HTTP {resp.status_code}"
                data = resp.get_json() if resp.status_code in (200, 201) else None
                if data:
                    r['create'] += f" (success={data.get('success')})"
                    item = data.get('item') or data.get('server') or data.get('data') or {}
                    created_id = item.get('id') or item.get('server_id') or data.get('id')
            except Exception as e:
                r['create'] = f"ERROR: {e}"
            
            # DETAIL (GET /<id>)
            if created_id:
                try:
                    resp = client.get(f"{list_url}/{created_id}")
                    r['detail'] = f"HTTP {resp.status_code}"
                except Exception as e:
                    r['detail'] = f"ERROR: {e}"
            else:
                r['detail'] = "SKIP (no created_id)"
            
            # UPDATE (PUT /<id>)
            if created_id:
                try:
                    update_data = {'status': '점검중'}
                    resp = client.put(f"{list_url}/{created_id}", json=update_data)
                    r['update'] = f"HTTP {resp.status_code}"
                except Exception as e:
                    r['update'] = f"ERROR: {e}"
            else:
                r['update'] = "SKIP (no created_id)"
            
            # DELETE (POST /bulk-delete)
            if created_id:
                try:
                    resp = client.post(f"{list_url}/bulk-delete", json={'ids': [created_id]})
                    r['delete'] = f"HTTP {resp.status_code}"
                    data = resp.get_json() if resp.status_code == 200 else None
                    if data:
                        r['delete'] += f" (success={data.get('success')})"
                except Exception as e:
                    r['delete'] = f"ERROR: {e}"
            else:
                r['delete'] = "SKIP (no created_id)"
            
            results[name] = r
        
        # === 거버넌스 API 테스트 ===
        gov_apis = [
            ('백업정책', '/api/gov/backup-policies'),
            ('패키지관리', '/api/gov/packages'),
            ('취약점분석', '/api/gov/vulnerabilities'),
            ('IP정책', '/api/gov/ip-policies'),
            ('DNS정책', '/api/gov/dns-policies'),
            ('AD정책', '/api/gov/ad-policies'),
            ('VPN정책', '/api/gov/vpn-policies'),
            ('전용회선', '/api/gov/dedicated-lines'),
            ('불용자산', '/api/gov/unused-assets'),
            ('DR훈련', '/api/gov/dr-trainings'),
        ]
        
        for name, url in gov_apis:
            r = {}
            try:
                resp = client.get(url)
                r['list'] = f"HTTP {resp.status_code}"
                if resp.status_code == 200:
                    data = resp.get_json()
                    r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
            except Exception as e:
                r['list'] = f"ERROR: {e}"
            results[name] = r
        
        # === 데이터센터 API 테스트 ===
        dc_apis = [
            ('출입관리', '/api/dc/access-controls'),
            ('출입기록', '/api/dc/access-records'),
            ('데이터삭제', '/api/dc/data-deletions'),
            ('RACK관리', '/api/dc/racks'),
            ('온습도관리', '/api/dc/thermometers'),
            ('CCTV관리', '/api/dc/cctvs'),
        ]
        
        for name, url in dc_apis:
            r = {}
            try:
                resp = client.get(url)
                r['list'] = f"HTTP {resp.status_code}"
                if resp.status_code == 200:
                    data = resp.get_json()
                    r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
            except Exception as e:
                r['list'] = f"ERROR: {e}"
            results[name] = r
        
        # === 비용관리 API 테스트 ===
        cost_apis = [
            ('OPEX', '/api/cost/opex'),
            ('CAPEX', '/api/cost/capex'),
        ]
        
        for name, url in cost_apis:
            r = {}
            try:
                resp = client.get(url)
                r['list'] = f"HTTP {resp.status_code}"
                if resp.status_code == 200:
                    data = resp.get_json()
                    r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
            except Exception as e:
                r['list'] = f"ERROR: {e}"
            results[name] = r
        
        # === 프로젝트 API 테스트 ===
        proj_apis = [
            ('프로젝트', '/api/projects'),
            ('작업', '/api/tasks'),
            ('워크플로우', '/api/workflows'),
        ]
        
        for name, url in proj_apis:
            r = {}
            try:
                resp = client.get(url)
                r['list'] = f"HTTP {resp.status_code}"
                if resp.status_code == 200:
                    data = resp.get_json()
                    r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
            except Exception as e:
                r['list'] = f"ERROR: {e}"
            results[name] = r
        
        # === 카테고리 API 테스트 ===
        cat_apis = [
            ('비즈니스-업무분류', '/api/categories/business-work'),
            ('비즈니스-업무구분', '/api/categories/business-division'),
            ('HW카테고리-서버', '/api/categories/hw-server'),
            ('SW카테고리-OS', '/api/categories/sw-os'),
            ('컴포넌트-CPU', '/api/categories/component-cpu'),
            ('회사', '/api/categories/companies'),
            ('부서', '/api/categories/departments'),
            ('고객', '/api/categories/customers'),
            ('벤더-제조사', '/api/vendor-manufacturers'),
            ('벤더-유지보수', '/api/vendor-maintenances'),
        ]
        
        for name, url in cat_apis:
            r = {}
            try:
                resp = client.get(url)
                r['list'] = f"HTTP {resp.status_code}"
                if resp.status_code == 200:
                    data = resp.get_json()
                    r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
            except Exception as e:
                r['list'] = f"ERROR: {e}"
            results[name] = r
        
        # === 인사이트 API 테스트 ===
        insight_apis = [
            ('기술자료-트렌드', '/api/insights/trends'),
            ('기술자료-보안', '/api/insights/security'),
            ('블로그', '/api/insights/blogs'),
        ]
        
        for name, url in insight_apis:
            r = {}
            try:
                resp = client.get(url)
                r['list'] = f"HTTP {resp.status_code}"
                if resp.status_code == 200:
                    data = resp.get_json()
                    r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
            except Exception as e:
                r['list'] = f"ERROR: {e}"
            results[name] = r
    
    # Print results
    for name, r in results.items():
        print(f"\n  [{name}]")
        for op, val in r.items():
            status = "✓" if "200" in str(val) or "201" in str(val) else "✗"
            print(f"    {status} {op}: {val}")


def test_api_routes_discovery():
    """API 라우트 탐색 - 실제 존재하는 API 엔드포인트 확인"""
    print("\n" + "=" * 80)
    print("[3] API 라우트 탐색 (실제 등록된 URL 규칙)")
    print("=" * 80)
    
    with app.app_context():
        api_rules = []
        for rule in app.url_map.iter_rules():
            url = str(rule)
            if '/api/' in url:
                methods = ','.join(sorted(rule.methods - {'HEAD', 'OPTIONS'}))
                api_rules.append((url, methods, rule.endpoint))
        
        api_rules.sort()
        
        # Group by domain
        domains = {}
        for url, methods, endpoint in api_rules:
            parts = url.split('/')
            domain = parts[2] if len(parts) > 2 else 'root'
            if domain not in domains:
                domains[domain] = []
            domains[domain].append((url, methods, endpoint))
        
        for domain in sorted(domains.keys()):
            items = domains[domain]
            print(f"\n  [{domain}] ({len(items)} endpoints)")
            for url, methods, endpoint in items[:5]:  # Show first 5 per domain
                print(f"    {methods:20s} {url}")
            if len(items) > 5:
                print(f"    ... and {len(items)-5} more")
        
        print(f"\n  Total API endpoints: {len(api_rules)}")


if __name__ == '__main__':
    investigate_failures()
    test_api_routes_discovery()
    test_api_crud()
    print("\n" + "=" * 80)
    print("점검 완료")
