"""
QA 전수 점검 3단계: 실제 API URL 기반 CRUD 테스트
"""
import sys, os, json, traceback
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.routes.pages import TEMPLATE_MAP

app = create_app('testing')

def test_correct_api_crud():
    """실제 라우트 기반 API CRUD 테스트"""
    
    results = {}
    
    with app.test_client() as client:
        client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
        
        # === 1. 서버 CRUD (hardware scope 기반) ===
        scopes = [
            ('서버-OnPremise', 'onpremise'),
            ('서버-Cloud', 'cloud'),
            ('서버-Frame', 'frame'),
            ('서버-Workstation', 'workstation'),
            ('스토리지-SAN', 'storage'),
            ('스토리지-Backup', 'backup'),
            ('SAN-Director', 'san_director'),
            ('SAN-Switch', 'san_switch'),
            ('네트워크-L2', 'l2'),
            ('네트워크-L4', 'l4'),
            ('네트워크-L7', 'l7'),
            ('네트워크-AP', 'ap'),
            ('네트워크-전용회선', 'dedicateline'),
            ('보안-Firewall', 'firewall'),
            ('보안-VPN', 'vpn'),
            ('보안-IDS', 'ids'),
            ('보안-IPS', 'ips'),
            ('보안-HSM', 'hsm'),
            ('보안-KMS', 'kms'),
            ('보안-WIPS', 'wips'),
            ('보안-ETC', 'etc_security'),
        ]
        
        for name, scope in scopes:
            r = {}
            # LIST
            resp = client.get(f'/api/hardware/assets?scope={scope}')
            r['list'] = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                data = resp.get_json()
                r['list'] += f" (success={data.get('success')}, total={data.get('total', '?')})"
            
            # CREATE
            resp = client.post(f'/api/hardware/assets', json={
                'hostname': f'QA_TEST_{scope.upper()}_001',
                'asset_category': scope,
                'ip_address': '10.99.99.1',
                'status': '운영중'
            })
            r['create'] = f"HTTP {resp.status_code}"
            created_id = None
            if resp.status_code in (200, 201):
                data = resp.get_json()
                r['create'] += f" (success={data.get('success')})"
                if data.get('success'):
                    item = data.get('item') or data.get('server') or data.get('asset') or data.get('data') or {}
                    created_id = item.get('id') or item.get('asset_id') or data.get('id')
            
            # DETAIL
            if created_id:
                resp = client.get(f'/api/hardware/assets/{created_id}')
                r['detail'] = f"HTTP {resp.status_code}"
            else:
                r['detail'] = 'SKIP'
            
            # UPDATE
            if created_id:
                resp = client.put(f'/api/hardware/assets/{created_id}', json={'status': '점검중'})
                r['update'] = f"HTTP {resp.status_code}"
            else:
                r['update'] = 'SKIP'
            
            # DELETE
            if created_id:
                resp = client.post(f'/api/hardware/assets/bulk-delete', json={'ids': [created_id]})
                r['delete'] = f"HTTP {resp.status_code}"
                if resp.status_code == 200:
                    data = resp.get_json()
                    r['delete'] += f" (success={data.get('success')})"
            else:
                r['delete'] = 'SKIP'
            
            results[name] = r
        
        # === 2. 거버넌스 APIs ===
        gov_tests = [
            ('백업-대시보드', '/api/governance/backup/dashboard', 'GET', None),
            ('백업-정책목록', '/api/governance/backup/policies', 'GET', None),
            ('백업-테이프', '/api/governance/backup/libraries', 'GET', None),
            ('패키지-대시보드', '/api/governance/package/dashboard', 'GET', None),
            ('IP정책목록', '/api/network/ip', 'GET', None),
            ('DNS정책목록', '/api/network/dns', 'GET', None),
            ('AD정책목록', '/api/network/ad', 'GET', None),
            ('VPN정책목록', '/api/network/vpn-lines', 'GET', None),
            ('전용회선목록', '/api/network/dedicated-lines', 'GET', None),
            ('불용자산', '/api/gov-unused/assets', 'GET', None),
            ('취약점-대시보드', '/api/governance/vulnerability/dashboard', 'GET', None),
            ('DR훈련', '/api/governance/dr/trainings', 'GET', None),
        ]
        
        for name, url, method, payload in gov_tests:
            r = {}
            if method == 'GET':
                resp = client.get(url)
            else:
                resp = client.post(url, json=payload)
            r['list'] = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                try:
                    data = resp.get_json()
                    if isinstance(data, dict):
                        r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
                    elif isinstance(data, list):
                        r['list'] += f" (list, count={len(data)})"
                except:
                    pass
            results[name] = r
        
        # === 3. 데이터센터 APIs ===
        dc_tests = [
            ('출입관리', '/api/datacenter/access/controls'),
            ('출입기록', '/api/datacenter/access/records'),
            ('권한관리', '/api/datacenter/access/authority-controls'),
            ('권한기록', '/api/datacenter/access/authority-records'),
            ('데이터삭제', '/api/datacenter/data-deletion'),
            ('RACK목록', '/api/org-racks'),
            ('온습도목록', '/api/org-thermometers'),
            ('CCTV목록', '/api/org-cctvs'),
            ('온습도기록', '/api/thermometer-logs'),
        ]
        
        for name, url in dc_tests:
            r = {}
            resp = client.get(url)
            r['list'] = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                try:
                    data = resp.get_json()
                    if isinstance(data, dict):
                        r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
                    elif isinstance(data, list):
                        r['list'] += f" (list, count={len(data)})"
                except:
                    pass
            results[name] = r
        
        # === 4. 비용관리 APIs ===
        cost_tests = [
            ('OPEX-대시보드', '/api/opex-dashboard'),
            ('OPEX-계약', '/api/opex-contracts'),
            ('CAPEX-대시보드', '/api/capex-dashboard'),
            ('CAPEX-계약', '/api/capex-contracts'),
            ('비용-계약라인', '/api/cost-contract-lines'),
        ]
        
        for name, url in cost_tests:
            r = {}
            resp = client.get(url)
            r['list'] = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                try:
                    data = resp.get_json()
                    if isinstance(data, dict):
                        r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
                    elif isinstance(data, list):
                        r['list'] += f" (list, count={len(data)})"
                except:
                    pass
            results[name] = r
        
        # === 5. 프로젝트 APIs ===
        proj_tests = [
            ('프로젝트목록', '/api/prj/projects'),
            ('작업목록', '/api/tasks'),
            ('티켓목록', '/api/tickets'),
            ('워크플로우디자인', '/api/wf-designs'),
        ]
        
        for name, url in proj_tests:
            r = {}
            resp = client.get(url)
            r['list'] = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                try:
                    data = resp.get_json()
                    if isinstance(data, dict):
                        r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
                    elif isinstance(data, list):
                        r['list'] += f" (list, count={len(data)})"
                except:
                    pass
            results[name] = r
        
        # === 6. 인사이트 APIs ===
        insight_tests = [
            ('트렌드', '/api/insight/articles?category=trend'),
            ('보안', '/api/insight/articles?category=security'),
            ('리포트', '/api/insight/articles?category=report'),
            ('기술', '/api/insight/articles?category=technical'),
            ('블로그', '/api/insight/blog/posts'),
        ]
        
        for name, url in insight_tests:
            r = {}
            resp = client.get(url)
            r['list'] = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                try:
                    data = resp.get_json()
                    if isinstance(data, dict):
                        r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
                    elif isinstance(data, list):
                        r['list'] += f" (list, count={len(data)})"
                except:
                    pass
            results[name] = r
        
        # === 7. 카테고리 APIs ===
        cat_tests = [
            ('비즈니스-업무분류', '/api/work-categories'),
            ('비즈니스-업무구분', '/api/work-divisions'),
            ('비즈니스-업무상태', '/api/work-statuses'),
            ('비즈니스-운영분류', '/api/work-operations'),
            ('비즈니스-업무그룹', '/api/work-groups'),
            ('HW-서버타입', '/api/hw-server-types'),
            ('HW-스토리지타입', '/api/hw-storage-types'),
            ('HW-SAN타입', '/api/hw-san-types'),
            ('HW-네트워크타입', '/api/hw-network-types'),
            ('HW-보안타입', '/api/hw-security-types'),
            ('SW-OS타입', '/api/sw-os-types'),
            ('SW-DB타입', '/api/sw-db-types'),
            ('SW-미들웨어타입', '/api/sw-middleware-types'),
            ('SW-가상화타입', '/api/sw-virtual-types'),
            ('SW-보안타입', '/api/sw-security-types'),
            ('SW-HA타입', '/api/sw-ha-types'),
            ('컴포넌트-CPU', '/api/cmp-cpu-types'),
            ('컴포넌트-GPU', '/api/cmp-gpu-types'),
            ('컴포넌트-메모리', '/api/cmp-memory-types'),
            ('컴포넌트-디스크', '/api/cmp-disk-types'),
            ('컴포넌트-NIC', '/api/cmp-nic-types'),
            ('컴포넌트-HBA', '/api/cmp-hba-types'),
            ('컴포넌트-기타', '/api/cmp-etc-types'),
            ('회사', '/api/org-companies'),
            ('센터', '/api/org-centers'),
            ('부서', '/api/org-departments'),
            ('고객', '/api/customer-clients'),
            ('벤더-제조사', '/api/vendor-manufacturers'),
            ('벤더-유지보수', '/api/vendor-maintenance'),
        ]
        
        for name, url in cat_tests:
            r = {}
            resp = client.get(url)
            r['list'] = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                try:
                    data = resp.get_json()
                    if isinstance(data, dict):
                        r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
                    elif isinstance(data, list):
                        r['list'] += f" (list, count={len(data)})"
                except:
                    pass
            results[name] = r
        
        # === 8. 설정/기타 APIs ===
        etc_tests = [
            ('대시보드', '/api/dashboard/stats'),
            ('정보메시지', '/api/info-messages'),
            ('릴리즈노트', '/api/release-notes'),
            ('버전', '/api/version'),
            ('사용자목록', '/api/users'),
            ('메뉴목록', '/api/menus'),
            ('세션정보', '/api/session/me'),
        ]
        
        for name, url in etc_tests:
            r = {}
            resp = client.get(url)
            r['list'] = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                try:
                    data = resp.get_json()
                    if isinstance(data, dict):
                        r['list'] += f" (success={data.get('success', '?')}, total={data.get('total', '?')})"
                    elif isinstance(data, list):
                        r['list'] += f" (list, count={len(data)})"
                except:
                    pass
            results[name] = r
    
    # Print
    print("=" * 80)
    print("API CRUD 테스트 결과 (실제 라우트 기반)")
    print("=" * 80)
    
    pass_count = 0
    fail_count = 0
    for name, r in results.items():
        status_parts = []
        all_ok = True
        for op, val in r.items():
            ok = "200" in str(val) or "201" in str(val) or "SKIP" in str(val)
            if not ok:
                all_ok = False
            sym = "✓" if ok else "✗"
            status_parts.append(f"{sym} {op}={val}")
        
        if all_ok:
            pass_count += 1
        else:
            fail_count += 1
            print(f"  ✗ [{name}]")
            for s in status_parts:
                print(f"      {s}")
    
    print(f"\n  SUMMARY: PASS={pass_count}, FAIL={fail_count}")
    
    # Also print passed ones compactly
    print(f"\n  --- PASSED ({pass_count}) ---")
    for name, r in results.items():
        all_ok = all("200" in str(v) or "201" in str(v) or "SKIP" in str(v) for v in r.values())
        if all_ok:
            first_val = list(r.values())[0]
            print(f"    ✓ {name}: {first_val}")


def test_page_failures_detail():
    """페이지 실패 원인 상세 분석"""
    print("=" * 80)
    print("페이지 실패 원인 상세 분석")
    print("=" * 80)
    
    with app.test_client() as client:
        client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
        
        # 1. maint_contract_list - TemplateNotFound
        print("\n[1] maint_contract_list:")
        tmpl = TEMPLATE_MAP.get('maint_contract_list')
        print(f"  TEMPLATE_MAP value: {tmpl}")
        import os as _os
        tmpl_path = _os.path.join('app', 'templates', str(tmpl))
        print(f"  Template exists: {_os.path.exists(tmpl_path)}")
        
        # 2. hw_storage_backup_task / hw_storage_san_task - 404
        for key in ['hw_storage_backup_task', 'hw_storage_san_task']:
            print(f"\n[2] {key}:")
            tmpl = TEMPLATE_MAP.get(key, 'NOT IN MAP')
            print(f"  TEMPLATE_MAP value: {tmpl}")
        
        # Check similar keys that work
        print("\n[3] 유사 키 비교:")
        for k in sorted(TEMPLATE_MAP.keys()):
            if 'storage' in k and 'task' in k:
                print(f"  {k} -> {TEMPLATE_MAP[k]}")


if __name__ == '__main__':
    test_page_failures_detail()
    test_correct_api_crud()
    print("\n" + "=" * 80)
    print("점검 완료")
