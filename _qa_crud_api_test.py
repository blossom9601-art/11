"""QA CRUD/API v2"""
import sys, os, json, traceback
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding='utf-8')

from app import create_app
app = create_app('testing')

FAIL_KEYS = ['hw_storage_backup_task', 'hw_storage_san_task']

API_LIST_TESTS = [
    ('/api/dashboard/summary', '대시보드'),
    ('/api/hardware/server/onpremise', '서버 온프레미스'),
    ('/api/hardware/server/cloud', '서버 클라우드'),
    ('/api/hardware/server/frame', '서버 프레임'),
    ('/api/hardware/server/workstation', '서버 워크스테이션'),
    ('/api/hardware/storage/san', '스토리지 SAN'),
    ('/api/hardware/storage/backup', '스토리지 백업'),
    ('/api/hardware/san/director', 'SAN 디렉터'),
    ('/api/hardware/san/switch', 'SAN 스위치'),
    ('/api/hardware/network/l2', '네트워크 L2'),
    ('/api/hardware/network/l4', '네트워크 L4'),
    ('/api/hardware/network/l7', '네트워크 L7'),
    ('/api/hardware/network/ap', '네트워크 AP'),
    ('/api/hardware/network/dedicateline', '전용회선'),
    ('/api/hardware/security/firewall', '보안 방화벽'),
    ('/api/hardware/security/vpn', '보안 VPN'),
    ('/api/hardware/security/ids', '보안 IDS'),
    ('/api/hardware/security/ips', '보안 IPS'),
    ('/api/hardware/security/hsm', '보안 HSM'),
    ('/api/hardware/security/kms', '보안 KMS'),
    ('/api/hardware/security/wips', '보안 WIPS'),
    ('/api/hardware/security/etc', '보안 기타'),
    ('/api/gov/backup/policy', '백업 정책'),
    ('/api/gov/package', '패키지 관리'),
    ('/api/gov/vulnerability', '취약점 분석'),
    ('/api/gov/ip-policy', 'IP 정책'),
    ('/api/gov/dns-policy', 'DNS 정책'),
    ('/api/gov/vpn-policy', 'VPN 정책'),
    ('/api/gov/dedicatedline/member', '전용회선 정책'),
    ('/api/gov/unused-assets', '불용자산'),
    ('/api/datacenter/access-control', '출입관리'),
    ('/api/datacenter/data-deletion', '데이터삭제'),
    ('/api/datacenter/rack', 'RACK 관리'),
    ('/api/datacenter/thermometer', '온습도 관리'),
    ('/api/datacenter/cctv', 'CCTV 관리'),
    ('/api/cost/opex/hardware', 'OPEX 하드웨어'),
    ('/api/cost/opex/software', 'OPEX 소프트웨어'),
    ('/api/cost/capex/hardware', 'CAPEX 하드웨어'),
    ('/api/project', '프로젝트'),
    ('/api/task', '작업'),
    ('/api/workflow', '워크플로우'),
    ('/api/insight/trend', '트렌드'),
    ('/api/insight/blog', '블로그'),
    ('/api/category/hardware/server', 'HW 카테고리 서버'),
    ('/api/category/software/os', 'SW 카테고리 OS'),
    ('/api/category/component/cpu', '컴포넌트 CPU'),
    ('/api/category/company', '회사'),
    ('/api/category/vendor/manufacturer', '벤더 제조사'),
    ('/api/category/customer', '고객'),
    ('/api/category/business/work', '비즈니스 업무'),
]


def section(title):
    print("\n" + "=" * 70)
    print("  " + title)
    print("=" * 70)


# ─── 1. 스타트업 오류 분석 ───────────────────────────────────────
section("스타트업 오류 분석")
startup_errors = [
    ("org-user location column", "org_user 테이블 없음 -> location 컬럼 추가 실패"),
    ("access-zone migration", "access_permission 테이블 없음 -> 출입관리 데이터 조회 불가"),
    ("vendor-maintenance-sla/issue", "보조 SQLite DB 경로 없음 -> 유지보수 SLA/이슈 기능 불가"),
    ("info-message table init", "sys_info_message 테이블 생성 후 즉시 조회 실패 (순서 문제)"),
]
for name, desc in startup_errors:
    print(f"  [WARN] {name}: {desc}")

with app.app_context():
    from flask import current_app
    import sqlite3
    db_uri = current_app.config.get('SQLALCHEMY_DATABASE_URI', '')
    db_path = db_uri.replace('sqlite:///', '').split('?')[0]
    print(f"\n  DB 경로: {db_path}")
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        conn.close()
        for t in ['org_user', 'access_permission', 'sys_info_message']:
            print(f"  테이블 [{t}]: {'있음' if t in tables else '없음 (MISSING)' }")
    else:
        print("  DB 파일 없음 (테스트 DB)")


# ─── 2. 실제 API 라우트 발견 ─────────────────────────────────────
section("실제 등록 API 라우트 수집")
with app.app_context():
    api_rules = sorted(str(r) for r in app.url_map.iter_rules() if '/api/' in str(r))
    domains = {}
    for rule in api_rules:
        parts = rule.strip('/').split('/')
        domain = parts[1] if len(parts) >= 2 else 'other'
        domains.setdefault(domain, []).append(rule)
    for domain, routes in sorted(domains.items()):
        print(f"\n  [{domain}] {len(routes)}개")
        for r in routes[:10]:
            print(f"    {r}")
        if len(routes) > 10:
            print(f"    ... 외 {len(routes)-10}개")
    print(f"\n  총 API 라우트: {len(api_rules)}개")


# ─── 3. 404 실패 키 심층 분석 ────────────────────────────────────
section("404 실패 키 심층 점검")
with app.test_client() as client:
    client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
    for key in FAIL_KEYS:
        r1 = client.get(f'/p/{key}')
        r2 = client.get(f'/p/{key}', headers={'X-Requested-With': 'XMLHttpRequest'})
        print(f"\n  키: {key}")
        print(f"    일반 GET : HTTP {r1.status_code}")
        print(f"    AJAX GET : HTTP {r2.status_code}")
        if r2.status_code != 200:
            print(f"    응답     : {r2.data[:300].decode('utf-8', errors='replace')}")
    
    # maint_contract_list 오류
    print(f"\n  키: maint_contract_list")
    try:
        r = client.get('/p/maint_contract_list', headers={'X-Requested-With': 'XMLHttpRequest'})
        print(f"    AJAX GET : HTTP {r.status_code}")
        if r.status_code != 200:
            print(f"    응답     : {r.data[:300].decode('utf-8', errors='replace')}")
    except Exception as e:
        print(f"    예외     : {e}")


# ─── 4. 도메인별 목록 API 테스트 ─────────────────────────────────
section("도메인별 목록 API GET 테스트")
ok_list, fail_list = [], []
with app.test_client() as client:
    client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
    for url, label in API_LIST_TESTS:
        try:
            r = client.get(url)
            s = r.status_code
            if s in (200, 201):
                try:
                    d = json.loads(r.data)
                    if d.get('success') is False:
                        fail_list.append((label, url, f"success=false: {d.get('error','')}"))
                        print(f"  [FAIL] {label:<22} {url} -> {d.get('error','')}")
                    else:
                        rows = d.get('rows')
                        tot = d.get('total', len(rows) if rows is not None else '-')
                        ok_list.append(label)
                        print(f"  [PASS] {label:<22} {url} -> rows={tot}")
                except Exception:
                    ok_list.append(label)
                    print(f"  [PASS] {label:<22} {url} -> HTTP {s} (non-JSON)")
            elif s == 302:
                fail_list.append((label, url, "302 리디렉션"))
                print(f"  [FAIL] {label:<22} {url} -> HTTP 302 (로그인 필요?)")
            elif s == 404:
                fail_list.append((label, url, "404 API 없음"))
                print(f"  [FAIL] {label:<22} {url} -> HTTP 404 (엔드포인트 없음)")
            else:
                fail_list.append((label, url, f"HTTP {s}"))
                print(f"  [FAIL] {label:<22} {url} -> HTTP {s}")
        except Exception as e:
            fail_list.append((label, url, str(e)[:60]))
            print(f"  [ERR]  {label:<22} {url} -> {e}")

print(f"\n  PASS={len(ok_list)}, FAIL={len(fail_list)}")
if fail_list:
    print("  실패 목록:")
    for label, url, reason in fail_list:
        print(f"    - {label}: {reason} ({url})")


# ─── 5. CRUD 흐름 테스트 ─────────────────────────────────────────
section("CRUD 흐름 테스트 (서버 온프레미스)")
with app.test_client() as client:
    client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
    base = '/api/hardware/server/onpremise'

    # 목록
    r = client.get(base)
    if r.status_code != 200:
        print(f"  [SKIP] 목록조회 HTTP {r.status_code}")
    else:
        d = json.loads(r.data)
        total_before = d.get('total', len(d.get('rows', [])))
        print(f"  [PASS] 목록조회 -> {total_before}건")

        # 등록
        payload = {
            'hostname': 'QA-TEST-SVR-001', 'ip_address': '192.168.99.99',
            'os': 'CentOS 7', 'manufacturer': 'Dell',
            'model': 'PowerEdge R740', 'serial_no': 'QA-SN-001', 'status': 'active',
        }
        r2 = client.post(base, data=json.dumps(payload), content_type='application/json')
        if r2.status_code in (200, 201):
            d2 = json.loads(r2.data)
            if d2.get('success'):
                cid = (d2.get('item') or {}).get('id')
                print(f"  [PASS] 등록(Create) -> id={cid}")
            else:
                cid = None
                print(f"  [FAIL] 등록(Create) success=false: {d2.get('error', '')}")
        else:
            cid = None
            print(f"  [FAIL] 등록(Create) HTTP {r2.status_code}: {r2.data[:200].decode('utf-8','replace')}")

        # 목록 재확인
        if cid:
            d3 = json.loads(client.get(base).data)
            t3 = d3.get('total', len(d3.get('rows', [])))
            print(f"  [{'PASS' if t3 > total_before else 'FAIL'}] 등록후 목록반영 -> {total_before} -> {t3}건")

        # 수정
        if cid:
            r4 = client.put(f"{base}/{cid}", data=json.dumps({'hostname': 'QA-MODIFIED'}), content_type='application/json')
            if r4.status_code == 200:
                d4 = json.loads(r4.data)
                print(f"  [{'PASS' if d4.get('success') else 'FAIL'}] 수정(Update)" + ("" if d4.get('success') else f": {d4.get('error','')}"))
            else:
                print(f"  [FAIL] 수정(Update) HTTP {r4.status_code}: {r4.data[:200].decode('utf-8','replace')}")

        # 삭제
        if cid:
            r5 = client.post(f"{base}/bulk-delete", data=json.dumps({'ids': [cid]}), content_type='application/json')
            if r5.status_code == 200:
                d5 = json.loads(r5.data)
                print(f"  [{'PASS' if d5.get('success') else 'FAIL'}] 삭제(Delete)" + ("" if d5.get('success') else f": {d5.get('error','')}"))
            else:
                print(f"  [FAIL] 삭제 HTTP {r5.status_code}")

        # 삭제 후 목록
        if cid:
            d6 = json.loads(client.get(base).data)
            t6 = d6.get('total', len(d6.get('rows', [])))
            print(f"  [{'PASS' if t6 == total_before else 'WARN'}] 삭제후 목록 -> {t6}건 (기대={total_before})")


# ─── 6. 검색/필터/페이지네이션 ───────────────────────────────────
section("검색/필터/페이지네이션 테스트 (서버 온프레미스)")
with app.test_client() as client:
    client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
    base = '/api/hardware/server/onpremise'

    tests = [
        ('검색(search=test)', f"{base}?search=test"),
        ('페이지네이션(page=1,per_page=5)', f"{base}?page=1&per_page=5"),
        ('빈결과검색(ZZZNOMATCH)', f"{base}?search=ZZZNOMATCH99999"),
        ('정렬(sort=hostname,asc)', f"{base}?sort=hostname&order=asc"),
    ]
    for label, url in tests:
        r = client.get(url)
        if r.status_code == 200:
            d = json.loads(r.data)
            print(f"  [PASS] {label} -> total={d.get('total','?')}, rows={len(d.get('rows',[]))}")
        else:
            print(f"  [FAIL] {label} -> HTTP {r.status_code}")


# ─── 7. 인증/권한 테스트 ─────────────────────────────────────────
section("인증/권한 테스트")
with app.test_client() as client:
    # 비인증
    r = client.get('/api/hardware/server/onpremise')
    print(f"  비인증 API  : HTTP {r.status_code} (302=차단정상, 200=이상)")
    r2 = client.get('/p/hw_server_onpremise', headers={'X-Requested-With': 'XMLHttpRequest'})
    print(f"  비인증 페이지: HTTP {r2.status_code} (302=차단정상)")

    # 인증 후 잘못된 경로
    client.post('/auth/login', data={'user_id': 'admin', 'password': 'admin'})
    r3 = client.get('/p/NONEXISTENT_KEY_XYZ', headers={'X-Requested-With': 'XMLHttpRequest'})
    print(f"  잘못된 키   : HTTP {r3.status_code} (404=정상)")
    r4 = client.get('/api/hardware/server/onpremise/9999999')
    print(f"  잘못된 ID   : HTTP {r4.status_code} (404=정상)")

    # XSS 입력 테스트
    xss = '<script>alert(1)</script>'
    r5 = client.get(f'/api/hardware/server/onpremise?search={xss}')
    body = r5.data.decode('utf-8', errors='replace') if r5.status_code == 200 else ''
    xss_reflected = '<script>' in body
    print(f"  XSS 입력 검색: HTTP {r5.status_code} -> 스크립트 반사={'있음 (위험!)' if xss_reflected else '없음 (정상)'}")

print("\n" + "=" * 70)
print("전수 점검 완료")
