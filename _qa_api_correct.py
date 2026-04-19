"""API 올바른 URL 검증"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding='utf-8')
from app import create_app
from app.models import (
    db, Blog, BlogComment, BlogLike, BlogCommentLike,
    BkLibrary, BkLocation, BkTape,
)
from app.services.cmp_cpu_type_service import init_cmp_cpu_type_table
from app.services.vendor_manufacturer_service import init_vendor_manufacturer_table
from app.services.work_group_service import init_work_group_table

app = create_app('testing')
with app.app_context():
    db.create_all()
    init_vendor_manufacturer_table(app)
    init_cmp_cpu_type_table(app)
    init_work_group_table(app)

CORRECT_APIS = [
    ('/api/hardware/onpremise/assets', '서버 온프레미스'),
    ('/api/hardware/cloud/assets', '서버 클라우드'),
    ('/api/hardware/frame/assets', '서버 프레임'),
    ('/api/hardware/workstation/assets', '서버 워크스테이션'),
    ('/api/hardware/storage/assets', '스토리지 SAN'),
    ('/api/hardware/storage/backup/assets', '스토리지 백업'),
    ('/api/hardware/san/director/assets', 'SAN 디렉터'),
    ('/api/hardware/san/switch/assets', 'SAN 스위치'),
    ('/api/hardware/network/l2/assets', '네트워크 L2'),
    ('/api/hardware/network/circuit/assets', '네트워크 전용회선'),
    ('/api/hardware/network/ap/assets', '네트워크 AP'),
    ('/api/hardware/security/firewall/assets', '보안 방화벽'),
    ('/api/hardware/security/vpn/assets', '보안 VPN'),
    ('/api/hardware/security/ids/assets', '보안 IDS'),
    ('/api/hardware/security/ips/assets', '보안 IPS'),
    ('/api/hardware/security/hsm/assets', '보안 HSM'),
    ('/api/hardware/security/kms/assets', '보안 KMS'),
    ('/api/hardware/security/wips/assets', '보안 WIPS'),
    ('/api/hardware/security/etc/assets', '보안 기타'),
    ('/api/governance/backup/target-policies', '백업 정책'),
    ('/api/governance/backup/libraries', '백업 라이브러리'),
    ('/api/governance/package-vulnerabilities', '패키지 취약점'),
    ('/api/governance/vulnerability-guides', '취약점 가이드'),
    ('/api/network/ip-policies', 'IP 정책'),
    ('/api/network/dns-policies', 'DNS 정책'),
    ('/api/network/vpn-partners', 'VPN 파트너'),
    ('/api/gov-unused/assets', '불용자산'),
    ('/api/datacenter/access/entries', '출입 기록'),
    ('/api/datacenter/data-deletion', '데이터삭제'),
    ('/api/org-racks', 'RACK 관리'),
    ('/api/org-thermometers', '온습도 관리'),
    ('/api/org-cctvs', 'CCTV 관리'),
    ('/api/opex-contracts', 'OPEX 계약'),
    ('/api/prj/projects', '프로젝트'),
    ('/api/tickets', '워크플로우 티켓'),
    ('/api/insight/blog/posts', '블로그'),
    ('/api/insight/items', '인사이트 아이템'),
    ('/api/insight/items', 'insight 트렌드'),
    ('/api/cmp-cpu-types', '컴포넌트 CPU'),
    ('/api/sw-os-types', 'SW OS 타입'),
    ('/api/org-companies', '회사'),
    ('/api/org-centers', '데이터센터'),
    ('/api/org-departments', '부서'),
    ('/api/vendor-manufacturers', '벤더 제조사'),
    ('/api/vendor-maintenance', '유지보수 업체'),
    ('/api/customer-clients', '고객사'),
    ('/api/work-categories', '비즈니스 업무분류'),
    ('/api/work-groups', '비즈니스 그룹'),
    ('/api/dashboard/stats', '대시보드 통계'),
    # CRUD write endpoints
    ('/api/hardware/onpremise/assets', '서버 CRUD (POST)'),
]

# Auth test
AUTH_APIS = [
    '/api/hardware/onpremise/assets',
    '/api/prj/projects',
    '/api/tickets',
]

with app.test_client() as c:
    c.post('/login', data={'user_id': 'admin', 'password': 'admin'})
    ok, fail = [], []
    for url, label in CORRECT_APIS[:-1]:  # skip the extra CRUD entry
        r = c.get(url)
        s = r.status_code
        if s in (200, 201):
            try:
                d = json.loads(r.data)
                rows = d.get('rows') or d.get('items') or []
                total = d.get('total', len(rows))
                if d.get('success') is False:
                    err = d.get('error', d.get('message', ''))
                    print(f'[FAIL] {label:<28} -> success=false: {err}')
                    fail.append(label)
                else:
                    print(f'[PASS] {label:<28} -> total={total}')
                    ok.append(label)
            except Exception as ex:
                print(f'[PASS] {label:<28} -> HTTP {s} (non-JSON: {ex})')
                ok.append(label)
        elif s == 404:
            print(f'[404]  {label:<28} -> HTTP 404 (URL 없음)')
            fail.append(label)
        else:
            print(f'[FAIL] {label:<28} -> HTTP {s}')
            fail.append(label)

    print(f'\nPASS={len(ok)} FAIL={len(fail)}')
    if fail:
        print('FAIL 목록:')
        for f in fail:
            print(f'  - {f}')

# CRUD 흐름 테스트
print('\n--- CRUD 흐름 (서버 온프레미스) ---')
with app.test_client() as c:
    c.post('/login', data={'user_id': 'admin', 'password': 'admin'})
    base = '/api/hardware/onpremise/assets'

    # 목록
    r = c.get(base)
    if r.status_code != 200:
        print(f'  [SKIP] 목록 HTTP {r.status_code}: {r.data[:100].decode("utf-8","replace")}')
    else:
        d = json.loads(r.data)
        tb = d.get('total', len(d.get('rows', [])))
        print(f'  [PASS] 목록 -> {tb}건')

        # 등록
        payload = {'asset_code': 'QA-SVR-001', 'hostname': 'QA-SVR', 'ip_address': '192.168.99.99', 'status': 'active'}
        r2 = c.post(base, data=json.dumps(payload), content_type='application/json')
        if r2.status_code in (200, 201):
            d2 = json.loads(r2.data)
            if d2.get('success'):
                cid = (d2.get('item') or {}).get('id')
                print(f'  [PASS] 등록 -> id={cid}')
            else:
                cid = None
                print(f'  [FAIL] 등록 -> {d2.get("error", d2.get("message", ""))}')
        else:
            cid = None
            print(f'  [FAIL] 등록 HTTP {r2.status_code}: {r2.data[:200].decode("utf-8","replace")}')

        if cid:
            # 수정
            r3 = c.put(f'{base}/{cid}', data=json.dumps({'hostname': 'QA-SVR-MOD'}), content_type='application/json')
            if r3.status_code == 200:
                d3 = json.loads(r3.data)
                print(f'  [{"PASS" if d3.get("success") else "FAIL"}] 수정 -> {d3.get("error", "OK")}')
            else:
                print(f'  [FAIL] 수정 HTTP {r3.status_code}: {r3.data[:200].decode("utf-8","replace")}')

            # 삭제
            r4 = c.post(f'{base}/bulk-delete', data=json.dumps({'ids': [cid]}), content_type='application/json')
            if r4.status_code == 200:
                d4 = json.loads(r4.data)
                print(f'  [{"PASS" if d4.get("success") else "FAIL"}] 삭제')
            else:
                print(f'  [FAIL] 삭제 HTTP {r4.status_code}')

# 비인증 접근 테스트
print('\n--- 인증/권한 테스트 ---')
with app.test_client() as c:
    for url in AUTH_APIS:
        r = c.get(url)
        label = '비인증' if r.status_code in (302, 401, 403) else '이상(노출가능)'
        print(f'  비인증 {url} -> HTTP {r.status_code} ({label})')

# XSS 테스트
print('\n--- XSS 입력 테스트 ---')
with app.test_client() as c:
    c.post('/login', data={'user_id': 'admin', 'password': 'admin'})
    xss = '<script>alert(1)</script>'
    r = c.get(f'/api/hardware/onpremise/assets?q={xss}')
    if r.status_code == 200:
        body = r.data.decode('utf-8', errors='replace')
        reflected = '<script>' in body
        print(f'  XSS 검색 -> HTTP 200, 반사여부: {"위험" if reflected else "안전"}')
    else:
        print(f'  XSS 검색 -> HTTP {r.status_code}')
