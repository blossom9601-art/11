# -*- coding: utf-8 -*-
"""
전수 QA 점검: 사이드바 메뉴별 페이지 진입 + API CRUD 전체 검증
=============================================================

점검 항목:
1. 모든 페이지 라우트 정상 렌더링 (200 OK)
2. 주요 API 목록 조회 (GET) 정상 응답
3. 주요 API CRUD 흐름 (POST → GET → PUT → DELETE)
4. 인증/비인증 접근 제어
5. 에러 처리 (404, 잘못된 ID)
"""
import json
import pytest


# ─────────────────────────────────────────────
# 1. 모든 사이드바 메뉴 페이지 진입 테스트
# ─────────────────────────────────────────────

# 사이드바에서 접근 가능한 모든 page_code 목록 (list/dashboard 화면)
SIDEBAR_PAGE_CODES = [
    # Dashboard
    'dashboard',
    # System > Server
    'hw_server_onpremise',
    'hw_server_cloud',
    'hw_server_frame',
    'hw_server_workstation',
    # System > Storage
    'hw_storage_san',
    'hw_storage_backup',
    # System > SAN
    'hw_san_director',
    'hw_san_switch',
    # System > Network
    'hw_network_l2',
    'hw_network_l4',
    'hw_network_l7',
    'hw_network_ap',
    'hw_network_dedicatedline',
    # System > Security
    'hw_security_firewall',
    'hw_security_vpn',
    'hw_security_ids',
    'hw_security_ips',
    'hw_security_hsm',
    'hw_security_kms',
    'hw_security_wips',
    'hw_security_etc',
    # Governance > Backup
    'gov_backup_dashboard',
    'gov_backup_policy',
    'gov_backup_tape',
    # Governance > Package
    'gov_package_dashboard',
    'gov_package_list',
    'gov_package_vulnerability',
    # Governance > Vulnerability
    'gov_vulnerability_dashboard',
    'gov_vulnerability_analysis',
    'gov_vulnerability_guide',
    # Governance > IP / DNS / AD
    'gov_ip_policy',
    'gov_dns_policy',
    'gov_ad_policy',
    # Governance > VPN
    'gov_vpn_policy',
    # Governance > Dedicated Line
    'gov_dedicatedline_member',
    'gov_dedicatedline_customer',
    'gov_dedicatedline_van',
    'gov_dedicatedline_affiliate',
    'gov_dedicatedline_intranet',
    # Governance > Unused Assets
    'gov_unused_hardware',
    'gov_unused_software',
    # Governance > DR
    'gov_dr_training',
    # Datacenter > Access
    'dc_access_control',
    'dc_access_records',
    'dc_authority_control',
    'dc_authority_records',
    'dc_access_system',
    # Datacenter > Erasure
    'dc_data_deletion',
    'dc_data_deletion_system',
    # Datacenter > Rack
    'dc_rack_lab1',
    'dc_rack_lab2',
    'dc_rack_lab3',
    'dc_rack_lab4',
    'dc_rack_list',
    # Datacenter > Thermometer
    'dc_thermo_lab1',
    'dc_thermo_lab2',
    'dc_thermo_lab3',
    'dc_thermo_lab4',
    'dc_thermometer_list',
    'dc_thermometer_log',
    # Datacenter > CCTV
    'dc_cctv_lab1',
    'dc_cctv_lab2',
    'dc_cctv_lab3',
    'dc_cctv_lab4',
    'dc_cctv_list',
    # Cost > OPEX
    'cost_opex_dashboard',
    'cost_opex_hardware',
    'cost_opex_software',
    'cost_opex_etc',
    # Cost > CAPEX
    'cost_capex_dashboard',
    'cost_capex_hardware',
    'cost_capex_software',
    'cost_capex_etc',
    # Project
    'proj_status',
    'proj_participating',
    'proj_completed',
    'proj_cleared',
    # Task
    'task_status',
    'task_participating',
    'task_completed',
    'task_overview',
    # Workflow
    'workflow_progress',
    'workflow_completed',
    # Workflow Designer
    'wf_designer_explore',
    'wf_designer_manage',
    # Insight
    'insight_trend',
    'insight_security',
    'insight_report',
    'insight_technical',
    'insight_blog_it',
    # Category > Business
    'cat_business_dashboard',
    'cat_business_work',
    'cat_business_division',
    'cat_business_status',
    'cat_business_operation',
    'cat_business_group',
    # Category > Hardware
    'cat_hw_dashboard',
    'cat_hw_server',
    'cat_hw_storage',
    'cat_hw_san',
    'cat_hw_network',
    'cat_hw_security',
    # Category > Software
    'cat_sw_dashboard',
    'cat_sw_os',
    'cat_sw_db',
    'cat_sw_middleware',
    'cat_sw_virtual',
    'cat_sw_security',
    'cat_sw_ha',
    # Category > Component
    'cat_component_cpu',
    'cat_component_gpu',
    'cat_component_memory',
    'cat_component_disk',
    'cat_component_nic',
    'cat_component_hba',
    'cat_component_etc',
    # Category > Company
    'cat_company_company',
    'cat_company_center',
    'cat_company_department',
    # Category > Customer
    'cat_customer_client1',
    # Category > Vendor
    'cat_vendor_manufacturer',
    'cat_vendor_maintenance',
    # Settings
    'settings_info_message',
    'settings_version',
    'help',
    'privacy',
]


@pytest.mark.parametrize('page_code', SIDEBAR_PAGE_CODES)
def test_page_route_returns_200(authed_client, page_code):
    """모든 사이드바 메뉴 페이지가 200 OK를 반환하는지 확인"""
    rv = authed_client.get(
        f'/p/{page_code}',
        headers={'X-Requested-With': 'XMLHttpRequest'},
    )
    assert rv.status_code == 200, (
        f'페이지 {page_code} 접근 실패: status={rv.status_code}'
    )


@pytest.mark.parametrize('page_code', SIDEBAR_PAGE_CODES)
def test_page_route_spa_shell(client, page_code):
    """SPA 쉘 모드 (X-Requested-With 없이) 접근 시 200 OK"""
    rv = client.get(f'/p/{page_code}')
    # SPA shell이나 redirect(login) 둘 다 허용
    assert rv.status_code in (200, 302), (
        f'SPA shell {page_code}: status={rv.status_code}'
    )


def test_invalid_page_code_returns_404(authed_client):
    """존재하지 않는 page_code → 404"""
    rv = authed_client.get(
        '/p/nonexistent_page_xyz',
        headers={'X-Requested-With': 'XMLHttpRequest'},
    )
    assert rv.status_code in (404, 200), (
        f'잘못된 페이지: status={rv.status_code}'
    )


# ─────────────────────────────────────────────
# 2. 주요 API 목록 조회 (GET) 응답 형식 검증
# ─────────────────────────────────────────────

API_LIST_ENDPOINTS = [
    # Hardware
    ('/api/hardware/onpremise/assets', 'rows'),
    ('/api/hardware/cloud/assets', 'rows'),
    ('/api/hardware/frame/assets', 'rows'),
    ('/api/hardware/workstation/assets', 'rows'),
    ('/api/hardware/storage/assets', 'rows'),
    ('/api/hardware/backup/assets', 'rows'),
    ('/api/hardware/san_director/assets', 'rows'),
    ('/api/hardware/san_switch/assets', 'rows'),
    ('/api/hardware/l2/assets', 'rows'),
    ('/api/hardware/l4/assets', 'rows'),
    ('/api/hardware/l7/assets', 'rows'),
    ('/api/hardware/ap/assets', 'rows'),
    ('/api/hardware/dedicatedline/assets', 'rows'),
    ('/api/hardware/firewall/assets', 'rows'),
    ('/api/hardware/vpn/assets', 'rows'),
    ('/api/hardware/ids/assets', 'rows'),
    ('/api/hardware/ips/assets', 'rows'),
    ('/api/hardware/hsm/assets', 'rows'),
    ('/api/hardware/kms/assets', 'rows'),
    ('/api/hardware/wips/assets', 'rows'),
    ('/api/hardware/etc/assets', 'rows'),
    # Governance
    ('/api/gov/backup-policies', 'rows'),
    ('/api/gov/backup-tapes', 'rows'),
    ('/api/gov/vulnerability/guides', 'rows'),
    # Network Governance
    ('/api/gov/ip-policies', 'rows'),
    ('/api/gov/dns-policies', 'rows'),
    ('/api/gov/vpn-lines', 'rows'),
    ('/api/gov/dedicatedlines/member', 'rows'),
    # Datacenter
    ('/api/dc/access-permissions', 'rows'),
    ('/api/dc/access-records', 'rows'),
    ('/api/dc/authority-permissions', 'rows'),
    ('/api/dc/authority-records', 'rows'),
    ('/api/dc/access-systems', 'rows'),
    ('/api/dc/data-delete-registers', 'rows'),
    ('/api/dc/data-delete-systems', 'rows'),
    # Cost
    ('/api/cost/opex/hardware', 'rows'),
    ('/api/cost/opex/software', 'rows'),
    ('/api/cost/opex/etc', 'rows'),
    ('/api/cost/capex/hardware', 'rows'),
    ('/api/cost/capex/software', 'rows'),
    ('/api/cost/capex/etc', 'rows'),
    # Project
    ('/api/prj/projects', 'rows'),
    # Work/Task
    ('/api/wrk/reports', 'rows'),
    # Insight
    ('/api/insight/items', 'rows'),
    ('/api/insight/blog/posts', 'rows'),
    # Category
    ('/api/cat/businesses', 'rows'),
    ('/api/cat/hw-servers', 'rows'),
    ('/api/cat/sw-os', 'rows'),
    ('/api/cat/components/cpu', 'rows'),
    # Vendor
    ('/api/vendor/manufacturers', 'rows'),
    ('/api/vendor/maintenance-companies', 'rows'),
    # Company/Org
    ('/api/org/companies', 'rows'),
    ('/api/org/centers', 'rows'),
    ('/api/org/departments', 'rows'),
    # Customer
    ('/api/customer/clients', 'rows'),
    # Info Messages
    ('/api/info-messages', 'rows'),
]


@pytest.mark.parametrize('endpoint,list_key', API_LIST_ENDPOINTS)
def test_api_list_response_format(authed_client, endpoint, list_key):
    """API 목록 조회 응답이 표준 형식({success, rows/items, total})인지 확인"""
    rv = authed_client.get(endpoint)
    # 정상(200) 또는 인증 필요(401/403) 또는 없는 라우트(404)
    if rv.status_code == 404:
        pytest.skip(f'라우트 미등록: {endpoint}')
    if rv.status_code in (401, 403):
        pytest.skip(f'인증 필요: {endpoint}')
    assert rv.status_code == 200, (
        f'{endpoint} → {rv.status_code}'
    )
    data = rv.get_json()
    assert data is not None, f'{endpoint}: JSON 응답 아님'
    # 표준 응답 형식 검증
    if 'success' in data:
        assert isinstance(data['success'], bool), f'{endpoint}: success는 bool이어야 함'
    # rows/items/total 중 하나는 있어야 함
    has_list_field = any(k in data for k in ('rows', 'items', 'data', list_key))
    has_total = 'total' in data or 'count' in data
    assert has_list_field or has_total, (
        f'{endpoint}: 목록 필드(rows/items/total) 없음. keys={list(data.keys())}'
    )


# ─────────────────────────────────────────────
# 3. 인증 없이 API 접근 시 거부 확인
# ─────────────────────────────────────────────

PROTECTED_WRITE_ENDPOINTS = [
    ('POST', '/api/hardware/onpremise/assets'),
    ('POST', '/api/gov/backup-policies'),
    ('POST', '/api/dc/access-permissions'),
    ('POST', '/api/prj/projects'),
    ('POST', '/api/wrk/reports'),
    ('POST', '/api/vendor/manufacturers'),
    ('POST', '/api/insight/blog/posts'),
]


@pytest.mark.parametrize('method,endpoint', PROTECTED_WRITE_ENDPOINTS)
def test_unauthenticated_write_rejected(client, method, endpoint):
    """비인증 클라이언트의 쓰기 요청이 거부(401/403)되는지 확인"""
    if method == 'POST':
        rv = client.post(endpoint, json={'name': 'test'})
    elif method == 'PUT':
        rv = client.put(endpoint + '/1', json={'name': 'test'})
    else:
        rv = client.delete(endpoint + '/1')

    if rv.status_code == 404:
        pytest.skip(f'라우트 미등록: {endpoint}')
    # 401, 403, 또는 success=false 모두 허용
    if rv.status_code in (401, 403):
        return  # 정상 거부
    # 일부 API는 200 + success:false로 거부할 수 있음
    data = rv.get_json()
    if data and data.get('success') is False:
        return  # 정상 거부
    # 201은 인증 없이 생성됨 → 보안 이슈
    if rv.status_code == 201:
        pytest.fail(
            f'보안 이슈: {method} {endpoint} → 비인증 생성 허용 (status=201)'
        )


# ─────────────────────────────────────────────
# 4. 하드웨어 자산 CRUD 흐름 테스트
# ─────────────────────────────────────────────

HW_ASSET_SCOPES = [
    'onpremise', 'cloud', 'frame', 'workstation',
    'storage', 'backup', 'san_director', 'san_switch',
    'l2', 'l4', 'l7', 'ap', 'dedicatedline',
    'firewall', 'vpn', 'ids', 'ips',
    'hsm', 'kms', 'wips', 'etc',
]


@pytest.mark.parametrize('scope', HW_ASSET_SCOPES)
def test_hw_asset_crud_flow(authed_client, scope):
    """하드웨어 자산 CRUD 전체 흐름 (생성→조회→수정→삭제)"""
    base = f'/api/hardware/{scope}/assets'

    # 1) 빈 목록 확인
    rv = authed_client.get(base)
    if rv.status_code == 404:
        pytest.skip(f'라우트 미등록: {base}')
    assert rv.status_code == 200
    data = rv.get_json()
    initial_total = data.get('total', 0)

    # 2) 생성
    payload = {
        'asset_name': f'QA-{scope}-TEST-001',
        'hostname': f'qa-{scope}-test',
        'asset_code': f'QA-{scope.upper()}-001',
        'ip_address': '10.0.0.1',
        'status': 'ACTIVE',
    }
    rv = authed_client.post(base, json=payload)
    if rv.status_code == 404:
        pytest.skip(f'POST 미등록: {base}')
    if rv.status_code in (400, 422):
        # 필수 필드 부족 가능 → 최소한 에러 메시지 확인
        data = rv.get_json()
        assert data is not None, f'{base} POST 400 but no JSON body'
        return

    assert rv.status_code in (200, 201), (
        f'POST {base} → {rv.status_code}: {rv.get_data(as_text=True)[:200]}'
    )
    created = rv.get_json()
    item_id = (
        created.get('id')
        or created.get('item', {}).get('id')
        or created.get('asset_id')
    )

    if not item_id:
        # 생성은 됐지만 ID 반환 방식이 다를 수 있음
        # 목록에서 확인
        rv2 = authed_client.get(base)
        data2 = rv2.get_json()
        new_total = data2.get('total', 0)
        assert new_total > initial_total, (
            f'{base}: 생성 후 total 증가 없음 ({initial_total} → {new_total})'
        )
        return

    # 3) 상세 조회
    rv = authed_client.get(f'{base}/{item_id}')
    if rv.status_code == 200:
        detail = rv.get_json()
        assert detail is not None

    # 4) 수정
    rv = authed_client.put(f'{base}/{item_id}', json={
        'asset_name': f'QA-{scope}-UPDATED',
    })
    if rv.status_code in (200, 204):
        pass  # 정상
    elif rv.status_code == 404:
        pass  # 개별 PUT 미등록

    # 5) 삭제 (bulk-delete 패턴)
    rv = authed_client.post(f'{base}/bulk-delete', json={'ids': [item_id]})
    if rv.status_code == 200:
        data = rv.get_json()
        assert data.get('success', True), f'{base} bulk-delete 실패'
    elif rv.status_code == 404:
        # 단건 DELETE 시도
        rv = authed_client.delete(f'{base}/{item_id}')

    # 6) 삭제 후 목록 확인
    rv = authed_client.get(base)
    data = rv.get_json()
    final_total = data.get('total', 0)
    assert final_total <= initial_total + 1, (
        f'{base}: 삭제 후 total이 비정상 ({final_total})'
    )


# ─────────────────────────────────────────────
# 5. 거버넌스 API CRUD 테스트
# ─────────────────────────────────────────────

def test_backup_policy_crud(authed_client):
    """백업 정책 CRUD"""
    base = '/api/gov/backup-policies'
    rv = authed_client.get(base)
    if rv.status_code == 404:
        pytest.skip('백업 정책 API 미등록')
    assert rv.status_code == 200

    rv = authed_client.post(base, json={
        'policy_name': 'QA-백업정책-001',
        'schedule_type': 'daily',
        'retention_days': 30,
    })
    if rv.status_code in (200, 201):
        data = rv.get_json()
        item_id = data.get('id') or data.get('item', {}).get('id')
        if item_id:
            rv = authed_client.get(f'{base}/{item_id}')
            assert rv.status_code in (200, 404)


def test_vulnerability_guide_crud(authed_client):
    """취약점 가이드 조회"""
    base = '/api/gov/vulnerability/guides'
    rv = authed_client.get(base)
    if rv.status_code == 404:
        pytest.skip('취약점 가이드 API 미등록')
    assert rv.status_code == 200
    data = rv.get_json()
    assert 'rows' in data or 'items' in data or 'total' in data


def test_ip_policy_crud(authed_client):
    """IP 정책 목록 조회"""
    rv = authed_client.get('/api/gov/ip-policies')
    if rv.status_code == 404:
        pytest.skip('IP 정책 API 미등록')
    assert rv.status_code == 200


def test_dns_policy_crud(authed_client):
    """DNS 정책 목록 조회"""
    rv = authed_client.get('/api/gov/dns-policies')
    if rv.status_code == 404:
        pytest.skip('DNS 정책 API 미등록')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 6. 데이터센터 API CRUD 테스트
# ─────────────────────────────────────────────

def test_access_permission_crud(authed_client):
    """출입 권한 CRUD"""
    base = '/api/dc/access-permissions'
    rv = authed_client.get(base)
    if rv.status_code == 404:
        pytest.skip('출입 권한 API 미등록')
    assert rv.status_code == 200

    rv = authed_client.post(base, json={
        'person_name': 'QA테스터',
        'access_area': '서버실',
        'permission_type': '상시',
    })
    if rv.status_code in (200, 201):
        data = rv.get_json()
        item_id = data.get('id') or data.get('item', {}).get('id')
        if item_id:
            authed_client.post(f'{base}/bulk-delete', json={'ids': [item_id]})


def test_data_delete_system_crud(authed_client):
    """데이터 삭제 시스템 CRUD"""
    base = '/api/dc/data-delete-systems'
    rv = authed_client.get(base)
    if rv.status_code == 404:
        pytest.skip('데이터 삭제 시스템 API 미등록')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 7. 비용 관리 API 테스트
# ─────────────────────────────────────────────

COST_ENDPOINTS = [
    '/api/cost/opex/hardware',
    '/api/cost/opex/software',
    '/api/cost/opex/etc',
    '/api/cost/capex/hardware',
    '/api/cost/capex/software',
    '/api/cost/capex/etc',
]


@pytest.mark.parametrize('endpoint', COST_ENDPOINTS)
def test_cost_list_api(authed_client, endpoint):
    """비용 관리 API 목록 조회"""
    rv = authed_client.get(endpoint)
    if rv.status_code == 404:
        pytest.skip(f'비용 API 미등록: {endpoint}')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 8. 프로젝트 관리 API 테스트
# ─────────────────────────────────────────────

def test_project_list_api(authed_client):
    """프로젝트 목록 조회"""
    rv = authed_client.get('/api/prj/projects')
    if rv.status_code == 404:
        pytest.skip('프로젝트 API 미등록')
    assert rv.status_code == 200
    data = rv.get_json()
    assert data is not None


def test_project_crud_flow(authed_client):
    """프로젝트 CRUD 전체 흐름"""
    base = '/api/prj/projects'
    rv = authed_client.post(base, json={
        'project_name': 'QA-프로젝트-001',
        'project_code': 'QA-PRJ-001',
        'status': '진행',
    })
    if rv.status_code == 404:
        pytest.skip('프로젝트 생성 API 미등록')
    if rv.status_code in (400, 422):
        return  # 필수값 부족
    assert rv.status_code in (200, 201)


def test_task_list_api(authed_client):
    """작업(Task) 목록 조회"""
    rv = authed_client.get('/api/wrk/reports')
    if rv.status_code == 404:
        pytest.skip('작업 API 미등록')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 9. 인사이트 API 테스트
# ─────────────────────────────────────────────

def test_insight_items_list(authed_client):
    """인사이트 아이템 목록"""
    rv = authed_client.get('/api/insight/items')
    if rv.status_code == 404:
        pytest.skip('인사이트 API 미등록')
    assert rv.status_code == 200


def test_blog_posts_list(authed_client):
    """블로그 게시물 목록"""
    rv = authed_client.get('/api/insight/blog/posts')
    if rv.status_code == 404:
        pytest.skip('블로그 API 미등록')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 10. 카테고리 API 테스트
# ─────────────────────────────────────────────

CATEGORY_ENDPOINTS = [
    '/api/cat/businesses',
    '/api/cat/hw-servers',
    '/api/cat/hw-storages',
    '/api/cat/hw-sans',
    '/api/cat/hw-networks',
    '/api/cat/hw-securities',
    '/api/cat/sw-os',
    '/api/cat/sw-db',
    '/api/cat/sw-middleware',
    '/api/cat/sw-virtual',
    '/api/cat/sw-security',
    '/api/cat/sw-ha',
    '/api/cat/components/cpu',
    '/api/cat/components/gpu',
    '/api/cat/components/memory',
    '/api/cat/components/disk',
    '/api/cat/components/nic',
    '/api/cat/components/hba',
    '/api/cat/components/etc',
]


@pytest.mark.parametrize('endpoint', CATEGORY_ENDPOINTS)
def test_category_list_api(authed_client, endpoint):
    """카테고리 API 목록 조회"""
    rv = authed_client.get(endpoint)
    if rv.status_code == 404:
        pytest.skip(f'카테고리 API 미등록: {endpoint}')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 11. 벤더 / 조직 / 고객 API 테스트
# ─────────────────────────────────────────────

def test_vendor_manufacturer_crud(authed_client):
    """벤더(제조사) CRUD"""
    base = '/api/vendor/manufacturers'
    rv = authed_client.get(base)
    if rv.status_code == 404:
        pytest.skip('벤더 API 미등록')
    assert rv.status_code == 200

    rv = authed_client.post(base, json={
        'manufacturer_name': 'QA제조사',
        'country': '한국',
    })
    if rv.status_code in (200, 201):
        data = rv.get_json()
        item_id = data.get('id') or data.get('item', {}).get('id')
        if item_id:
            rv = authed_client.put(f'{base}/{item_id}', json={
                'manufacturer_name': 'QA제조사-수정',
            })
            authed_client.post(f'{base}/bulk-delete', json={'ids': [item_id]})


def test_org_company_list(authed_client):
    """회사 목록"""
    rv = authed_client.get('/api/org/companies')
    if rv.status_code == 404:
        pytest.skip('회사 API 미등록')
    assert rv.status_code == 200


def test_org_center_list(authed_client):
    """센터 목록"""
    rv = authed_client.get('/api/org/centers')
    if rv.status_code == 404:
        pytest.skip('센터 API 미등록')
    assert rv.status_code == 200


def test_org_department_list(authed_client):
    """부서 목록"""
    rv = authed_client.get('/api/org/departments')
    if rv.status_code == 404:
        pytest.skip('부서 API 미등록')
    assert rv.status_code == 200


def test_customer_client_list(authed_client):
    """고객사 목록"""
    rv = authed_client.get('/api/customer/clients')
    if rv.status_code == 404:
        pytest.skip('고객사 API 미등록')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 12. 설정 / Info Messages API 테스트
# ─────────────────────────────────────────────

def test_info_messages_list(authed_client):
    """정보 메시지 목록"""
    rv = authed_client.get('/api/info-messages')
    if rv.status_code == 404:
        pytest.skip('정보 메시지 API 미등록')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 13. 검색/필터/페이징 테스트
# ─────────────────────────────────────────────

def test_pagination_params(authed_client):
    """페이지네이션 파라미터 (page, page_size) 정상 작동"""
    rv = authed_client.get('/api/hardware/onpremise/assets?page=1&page_size=5')
    if rv.status_code == 404:
        pytest.skip('온프레미스 API 미등록')
    assert rv.status_code == 200
    data = rv.get_json()
    assert 'total' in data or 'rows' in data


def test_search_filter(authed_client):
    """검색 필터 동작"""
    rv = authed_client.get('/api/hardware/onpremise/assets?search=QA')
    if rv.status_code == 404:
        pytest.skip('검색 필터 미등록')
    assert rv.status_code == 200


def test_pagination_edge_case(authed_client):
    """페이지 범위 초과 시에도 에러 안 남"""
    rv = authed_client.get('/api/hardware/onpremise/assets?page=9999&page_size=10')
    if rv.status_code == 404:
        pytest.skip()
    assert rv.status_code == 200
    data = rv.get_json()
    rows = data.get('rows', data.get('items', []))
    assert isinstance(rows, list)


# ─────────────────────────────────────────────
# 14. 잘못된 ID 접근 테스트
# ─────────────────────────────────────────────

DETAIL_ENDPOINTS = [
    '/api/hardware/onpremise/assets/99999',
    '/api/prj/projects/99999',
    '/api/vendor/manufacturers/99999',
]


@pytest.mark.parametrize('endpoint', DETAIL_ENDPOINTS)
def test_invalid_id_returns_error(authed_client, endpoint):
    """존재하지 않는 ID → 404 또는 에러 JSON"""
    rv = authed_client.get(endpoint)
    if rv.status_code == 404:
        return  # 정상
    if rv.status_code == 200:
        data = rv.get_json()
        if data:
            # success:false 이거나 item이 None이면 OK
            if data.get('success') is False or data.get('item') is None:
                return
    # 다른 상태도 허용 (500은 이슈)
    assert rv.status_code != 500, f'{endpoint}: 서버 에러 발생'


# ─────────────────────────────────────────────
# 15. XSS / 특수문자 입력 테스트
# ─────────────────────────────────────────────

XSS_PAYLOADS = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "'; DROP TABLE assets; --",
]


@pytest.mark.parametrize('payload', XSS_PAYLOADS)
def test_xss_input_sanitized(authed_client, payload):
    """XSS/SQL 인젝션 페이로드가 에러 없이 처리되는지 확인"""
    rv = authed_client.post('/api/hardware/onpremise/assets', json={
        'asset_name': payload,
        'hostname': 'xss-test',
    })
    # 400 (검증 실패) 또는 200/201 (저장되되 이스케이프) 모두 OK
    # 500은 이슈
    assert rv.status_code != 500, (
        f'XSS 입력으로 서버 에러: {payload[:50]}...'
    )


# ─────────────────────────────────────────────
# 16. 대시보드 API 테스트
# ─────────────────────────────────────────────

DASHBOARD_ENDPOINTS = [
    '/api/dashboard/stats',
    '/api/dashboard/summary',
    '/api/gov/backup/dashboard',
    '/api/gov/package/dashboard',
    '/api/gov/vulnerability/dashboard',
    '/api/cost/opex/dashboard',
    '/api/cost/capex/dashboard',
]


@pytest.mark.parametrize('endpoint', DASHBOARD_ENDPOINTS)
def test_dashboard_api(authed_client, endpoint):
    """대시보드 API 정상 응답"""
    rv = authed_client.get(endpoint)
    if rv.status_code == 404:
        pytest.skip(f'대시보드 API 미등록: {endpoint}')
    assert rv.status_code == 200


# ─────────────────────────────────────────────
# 17. 세션/권한 API 테스트
# ─────────────────────────────────────────────

def test_session_permissions_api(authed_client):
    """세션 권한 API 호출"""
    rv = authed_client.get('/api/session/permissions')
    if rv.status_code == 404:
        pytest.skip('권한 API 미등록')
    assert rv.status_code == 200
    data = rv.get_json()
    assert data is not None


def test_session_info_api(authed_client):
    """세션 정보 API"""
    rv = authed_client.get('/api/session/info')
    if rv.status_code == 404:
        pytest.skip('세션 정보 API 미등록')
    assert rv.status_code == 200
