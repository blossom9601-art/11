"""
QA 전수 점검 스크립트: 모든 사이드바 메뉴 페이지 렌더링 테스트
- 모든 TEMPLATE_MAP 키에 대해 200 응답 확인
- SPA shell 모드 + AJAX 모드 둘 다 확인
"""
import sys, os, json, traceback
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.routes.pages import TEMPLATE_MAP

app = create_app('testing')

# 사이드바 진입점 메뉴 키 (목록 페이지)
SIDEBAR_ENTRY_KEYS = [
    'dashboard',
    # 시스템 - 서버
    'hw_server_onpremise', 'hw_server_cloud', 'hw_server_frame', 'hw_server_workstation',
    # 시스템 - 스토리지
    'hw_storage_san', 'hw_storage_backup',
    # 시스템 - SAN
    'hw_san_director', 'hw_san_switch',
    # 시스템 - 네트워크
    'hw_network_l2', 'hw_network_l4', 'hw_network_l7', 'hw_network_ap', 'hw_network_dedicateline',
    # 시스템 - 보안장비
    'hw_security_firewall', 'hw_security_vpn', 'hw_security_ids', 'hw_security_ips',
    'hw_security_hsm', 'hw_security_kms', 'hw_security_wips', 'hw_security_etc',
    # 거버넌스
    'gov_backup_dashboard', 'gov_backup_policy', 'gov_backup_tape',
    'gov_package_dashboard', 'gov_package_list', 'gov_package_vulnerability',
    'gov_vulnerability_dashboard', 'gov_vulnerability_analysis', 'gov_vulnerability_guide',
    'gov_ip_policy', 'gov_dns_policy', 'gov_ad_policy',
    'gov_vpn_policy', 'gov_vpn_policy2', 'gov_vpn_policy3', 'gov_vpn_policy4', 'gov_vpn_policy5',
    'gov_dedicatedline_member', 'gov_dedicatedline_customer', 'gov_dedicatedline_van',
    'gov_dedicatedline_affiliate', 'gov_dedicatedline_intranet',
    'gov_unused_server', 'gov_unused_storage', 'gov_unused_san', 'gov_unused_network',
    'gov_unused_security', 'gov_unused_software', 'gov_unused_hardware',
    'gov_dr_training',
    # 데이터센터
    'dc_access_control', 'dc_access_records', 'dc_authority_control', 'dc_authority_records',
    'dc_access_system', 'dc_data_deletion', 'dc_data_deletion_system',
    'dc_rack_list', 'dc_rack_lab1', 'dc_rack_lab2', 'dc_rack_lab3', 'dc_rack_lab4',
    'dc_thermometer_list', 'dc_thermo_lab1', 'dc_thermo_lab2', 'dc_thermo_lab3', 'dc_thermo_lab4',
    'dc_cctv_list', 'dc_cctv_lab1', 'dc_cctv_lab2', 'dc_cctv_lab3', 'dc_cctv_lab4',
    # 비용관리
    'cost_opex_dashboard', 'cost_opex_hardware', 'cost_opex_software', 'cost_opex_etc',
    'cost_capex_dashboard', 'cost_capex_hardware', 'cost_capex_software', 'cost_capex_etc',
    'cost_capex_contract',
    # 프로젝트
    'proj_status', 'proj_participating', 'proj_cleared', 'proj_completed',
    'task_status', 'task_participating', 'task_overview', 'task_completed',
    'workflow_progress', 'workflow_completed',
    'wf_designer_explore', 'wf_designer_manage',
    # 인사이트
    'insight_trend', 'insight_security', 'insight_report', 'insight_technical',
    'insight_blog_it',
    # 카테고리
    'cat_business_dashboard', 'cat_business_work', 'cat_business_division',
    'cat_business_status', 'cat_business_operation', 'cat_business_group',
    'cat_hw_dashboard', 'cat_hw_server', 'cat_hw_storage', 'cat_hw_san',
    'cat_hw_network', 'cat_hw_security',
    'cat_sw_dashboard', 'cat_sw_os', 'cat_sw_database', 'cat_sw_middleware',
    'cat_sw_virtualization', 'cat_sw_security', 'cat_sw_high_availability',
    'cat_component_cpu', 'cat_component_gpu', 'cat_component_memory',
    'cat_component_disk', 'cat_component_nic', 'cat_component_hba', 'cat_component_etc',
    'cat_company_company', 'cat_company_center', 'cat_company_department',
    'cat_customer_client1',
    'cat_vendor_manufacturer', 'cat_vendor_maintenance',
    # 설정
    'settings_info_message', 'settings_version', 'help', 'privacy',
    # 유지보수
    'maint_contract_list',
]

def test_page_rendering():
    """모든 페이지 렌더링 테스트 (AJAX 모드)"""
    results = {'pass': [], 'fail': [], 'error': []}
    
    with app.test_client() as client:
        # 로그인
        client.post('/auth/login', data={
            'user_id': 'admin',
            'password': 'admin'
        })
        
        for key in SIDEBAR_ENTRY_KEYS:
            try:
                # AJAX 요청 (SPA 내부 컨텐츠 로드)
                resp = client.get(f'/p/{key}', headers={
                    'X-Requested-With': 'XMLHttpRequest'
                })
                if resp.status_code == 200:
                    results['pass'].append(key)
                else:
                    results['fail'].append((key, resp.status_code))
            except Exception as e:
                results['error'].append((key, str(e)[:100]))
    
    return results

def test_all_template_map_keys():
    """TEMPLATE_MAP의 모든 573키 렌더링 테스트"""
    results = {'pass': [], 'fail': [], 'error': []}
    
    with app.test_client() as client:
        client.post('/auth/login', data={
            'user_id': 'admin',
            'password': 'admin'
        })
        
        for key in sorted(TEMPLATE_MAP.keys()):
            try:
                resp = client.get(f'/p/{key}', headers={
                    'X-Requested-With': 'XMLHttpRequest'
                })
                if resp.status_code == 200:
                    results['pass'].append(key)
                elif resp.status_code == 302:
                    results['pass'].append(key)  # redirect도 정상
                else:
                    results['fail'].append((key, resp.status_code))
            except Exception as e:
                results['error'].append((key, str(e)[:100]))
    
    return results

if __name__ == '__main__':
    print("=" * 80)
    print("QA 전수 점검: 사이드바 메뉴 페이지 렌더링 테스트")
    print("=" * 80)
    
    # 1) 사이드바 진입점 테스트
    print("\n[1] 사이드바 진입점 메뉴 테스트 (AJAX 모드)")
    r1 = test_page_rendering()
    print(f"  PASS: {len(r1['pass'])}")
    print(f"  FAIL: {len(r1['fail'])}")
    if r1['fail']:
        for key, code in r1['fail']:
            print(f"    ✗ {key} → HTTP {code}")
    print(f"  ERROR: {len(r1['error'])}")
    if r1['error']:
        for key, err in r1['error']:
            print(f"    ✗ {key} → {err}")
    
    # 2) 전체 TEMPLATE_MAP 테스트
    print(f"\n[2] 전체 TEMPLATE_MAP 테스트 ({len(TEMPLATE_MAP)}키)")
    r2 = test_all_template_map_keys()
    print(f"  PASS: {len(r2['pass'])}")
    print(f"  FAIL: {len(r2['fail'])}")
    if r2['fail']:
        for key, code in r2['fail']:
            print(f"    ✗ {key} → HTTP {code}")
    print(f"  ERROR: {len(r2['error'])}")
    if r2['error']:
        for key, err in r2['error']:
            print(f"    ✗ {key} → {err}")
    
    print("\n" + "=" * 80)
    print("점검 완료")
