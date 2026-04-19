"""
QA Deep Test — 올바른 API 경로로 CRUD 전수 점검
"""
import sys
import json
import os
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("TESTING", "1")

# ── 앱 초기화 ──
from app import create_app

app = create_app("testing")

RESULTS = []
ERRORS = []

def r(status, name, detail="", severity="INFO"):
    tag = "✅" if status == "OK" else ("🔴" if severity in ("CRITICAL","HIGH") else ("🟡" if severity == "MEDIUM" else "⚪"))
    line = f"{tag} [{status}] {name}: {detail}"
    print(line)
    RESULTS.append({"status": status, "name": name, "detail": detail, "severity": severity})

# ── 테스트 클라이언트 + 인증 세션 ──
with app.test_client() as client:

    # --- 로그인 ---
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin1234!"})
    if resp.status_code != 200:
        resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    if resp.status_code != 200:
        resp = client.post("/login", data={"username": "admin", "password": "admin1234!"}, follow_redirects=True)

    login_ok = resp.status_code in (200, 302)
    r("OK" if login_ok else "FAIL", "인증 로그인", f"status={resp.status_code}", "HIGH" if not login_ok else "INFO")

    # session check
    sc = client.get("/api/auth/session-check")
    r("OK" if sc.status_code == 200 else "FAIL", "세션 체크", f"status={sc.status_code}")

    print("\n" + "="*70)
    print("PHASE A: 페이지 진입 테스트 (핵심 메뉴)")
    print("="*70)

    PAGE_KEYS = [
        ("대시보드", "dashboard"),
        ("온프레미스 서버", "hw_server_onpremise"),
        ("클라우드 서버", "hw_server_cloud"),
        ("백업 스토리지", "hw_storage_backup"),
        ("SAN 디렉터", "hw_san_director"),
        ("SAN 스위치", "hw_san_switch"),
        ("L2 네트워크", "hw_network_l2"),
        ("L4 네트워크", "hw_network_l4"),
        ("방화벽", "hw_security_firewall"),
        ("VPN 장비", "hw_security_vpn"),
        ("IDS", "hw_security_ids"),
        ("IPS", "hw_security_ips"),
        ("HSM", "hw_security_hsm"),
        ("KMS", "hw_security_kms"),
        ("WIPS", "hw_security_wips"),
        ("백업 대시보드", "gov_backup_dashboard"),
        ("패키지 대시보드", "gov_package_dashboard"),
        ("취약점 대시보드", "gov_vulnerability_dashboard"),
        ("IP 정책", "gov_ip_policy"),
        ("VPN 정책", "gov_vpn_policy"),
        ("전용회선 회원", "gov_dedicatedline_member"),
        ("미사용 자산", "gov_unused_server"),
        ("출입 통제", "dc_access_control"),
        ("데이터 삭제", "dc_data_deletion"),
        ("랙 목록", "dc_rack_list"),
        ("온도계 목록", "dc_thermometer_list"),
        ("CCTV 목록", "dc_cctv_list"),
        ("OPEX 대시보드", "cost_opex_dashboard"),
        ("CAPEX 대시보드", "cost_capex_dashboard"),
        ("프로젝트 현황", "proj_status"),
        ("티켓 현황", "proj_ticket"),
        ("인사이트", "insight_list"),
        ("카테고리-회사", "cat_business_company"),
        ("카테고리-제조사", "cat_vendor_manufacturer"),
        ("카테고리-유지보수사", "cat_vendor_maintenance"),
        ("카테고리-CPU", "cat_component_cpu"),
    ]

    page_ok = 0
    page_fail = 0
    for label, key in PAGE_KEYS:
        resp = client.get(f"/p/{key}")
        ok = resp.status_code == 200
        if ok:
            page_ok += 1
        else:
            page_fail += 1
            r("FAIL", f"페이지 진입: {label}", f"key={key} status={resp.status_code}", "HIGH")

    r("OK", f"페이지 진입 통계", f"{page_ok}개 OK / {page_fail}개 FAIL")

    print("\n" + "="*70)
    print("PHASE B: 인증 없이 접근 테스트 (보안)")
    print("="*70)

    with app.test_client() as anon:
        for label, key in PAGE_KEYS[:5]:
            resp = anon.get(f"/p/{key}")
            if resp.status_code == 200:
                r("FAIL", f"인증 없이 200 반환: {label}", f"/p/{key} → {resp.status_code} (302 expected)", "CRITICAL")
            elif resp.status_code in (302, 401, 403):
                r("OK", f"인증 차단: {label}", f"→ {resp.status_code}")

        # 존재하지 않는 페이지
        resp = anon.get("/p/nonexistent_xyz_key_99")
        if resp.status_code == 200:
            r("FAIL", "존재하지 않는 페이지 키", "/p/nonexistent → 200 (404 expected)", "MEDIUM")
        else:
            r("OK", "존재하지 않는 페이지 키", f"→ {resp.status_code}")

    print("\n" + "="*70)
    print("PHASE C: API 목록 조회 테스트 (올바른 경로)")
    print("="*70)

    LIST_APIS = [
        ("온프레미스 서버 목록", "/api/hardware/onpremise/assets"),
        ("백업 스토리지 목록", "/api/hardware/storage/backup/assets"),
        ("SAN 디렉터 목록", "/api/hardware/san/director/assets"),
        ("SAN 스위치 목록", "/api/hardware/san/switch/assets"),
        ("L2 스위치 목록", "/api/hardware/network/l2/assets"),
        ("L4 로드밸런서 목록", "/api/hardware/network/l4/assets"),
        ("방화벽 목록", "/api/hardware/security/firewall/assets"),
        ("VPN 장비 목록", "/api/hardware/security/vpn/assets"),
        ("IPS 장비 목록", "/api/hardware/security/ips/assets"),
        ("백업 스토리지풀 목록", "/api/governance/backup/storage-pools"),
        ("백업 정책 목록", "/api/governance/backup/target-policies"),
        ("라이브러리 목록", "/api/governance/backup/libraries"),
        ("테이프 목록", "/api/governance/backup/tapes"),
        ("IP 정책 목록", "/api/network/ip-policies"),
        ("VPN 파트너 목록", "/api/network/vpn-partners"),
        ("VPN 회선 목록", "/api/network/vpn-lines"),
        ("전용회선 목록", "/api/network/leased-lines"),
        ("DC 출입 권한 목록", "/api/datacenter/access/permissions"),
        ("DC 데이터삭제 목록", "/api/datacenter/data-deletion"),
        ("랙 목록", "/api/org-racks"),
        ("온도계 목록", "/api/org-thermometers"),
        ("CCTV 목록", "/api/org-cctvs"),
        ("OPEX 계약 목록", "/api/opex-contracts"),
        ("CAPEX 계약 목록", "/api/capex-contracts"),
        ("프로젝트 목록", "/api/prj/projects"),
        ("티켓 목록", "/api/tickets"),
        ("인사이트 목록", "/api/insight/items"),
        ("회사 목록", "/api/org-companies"),
        ("부서 목록", "/api/org-departments"),
        ("제조사 목록", "/api/vendor-manufacturers"),
        ("유지보수사 목록", "/api/vendor-maintenance"),
        ("CPU 타입 목록", "/api/cmp-cpu-types"),
        ("서버 백업 정책", "/api/hardware/server/backup-policies"),
        ("취약점 가이드", "/api/governance/vulnerability-guides"),
        ("패키지 목록", "/api/governance/packages"),
        ("워크그룹 목록", "/api/work-groups"),
        ("조직 목록", "/api/org-centers"),
        ("출입 시스템", "/api/datacenter/access/systems"),
        ("사용자 목록", "/api/org-users"),
    ]

    list_ok = 0
    list_fail_404 = []
    list_fail_500 = []
    list_fail_401 = []

    for label, url in LIST_APIS:
        resp = client.get(url)
        data = {}
        try:
            data = resp.get_json() or {}
        except Exception:
            pass

        if resp.status_code == 200:
            list_ok += 1
            rows = data.get("rows") or data.get("items") or data.get("data") or []
            total = data.get("total", len(rows))
            success = data.get("success", True)
            if not success:
                r("FAIL", f"API 응답 success=False: {label}", url, "MEDIUM")
            # OK
        elif resp.status_code == 404:
            list_fail_404.append((label, url))
            r("FAIL", f"API 404: {label}", url, "HIGH")
        elif resp.status_code == 500:
            err = data.get("error", "")
            list_fail_500.append((label, url, err))
            r("FAIL", f"API 500: {label}", f"{url} → {err[:80]}", "CRITICAL")
        elif resp.status_code == 401:
            list_fail_401.append((label, url))
            r("FAIL", f"API 401 인증 필요: {label}", url, "MEDIUM")
        else:
            r("FAIL", f"API {resp.status_code}: {label}", url, "MEDIUM")

    r("OK", f"API 목록 조회 통계", f"{list_ok}개 OK / {len(list_fail_404)}개 404 / {len(list_fail_500)}개 500 / {len(list_fail_401)}개 401")

    print("\n" + "="*70)
    print("PHASE D: CRUD 테스트 (등록/수정/삭제)")
    print("="*70)

    # D1. 제조사 CRUD (가장 단순한 엔티티)
    print("\n--- D1. 제조사 벤더 CRUD ---")
    import time
    ts = int(time.time())

    # CREATE
    payload = {"name": f"__QA_TEST_VENDOR_{ts}", "code": f"QA{ts}", "remark": "QA 자동테스트"}
    resp = client.post("/api/vendor-manufacturers", json=payload)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        vendor_id = (data.get("item") or {}).get("id")
        r("OK", "제조사 벤더 등록(POST)", f"id={vendor_id}")

        # READ
        resp2 = client.get(f"/api/vendor-manufacturers/{vendor_id}")
        d2 = resp2.get_json() or {}
        if resp2.status_code == 200:
            r("OK", "제조사 벤더 단건 조회(GET)", f"name={d2.get('item',{}).get('name','?')}")
        else:
            r("FAIL", "제조사 벤더 단건 조회(GET)", f"status={resp2.status_code}", "HIGH")

        # UPDATE
        resp3 = client.put(f"/api/vendor-manufacturers/{vendor_id}", json={"remark": "QA 수정됨"})
        d3 = resp3.get_json() or {}
        if resp3.status_code == 200 and d3.get("success"):
            r("OK", "제조사 벤더 수정(PUT)")
        else:
            r("FAIL", "제조사 벤더 수정(PUT)", f"status={resp3.status_code} success={d3.get('success')}", "MEDIUM")

        # DELETE (bulk-delete)
        resp4 = client.post("/api/vendor-manufacturers/bulk-delete", json={"ids": [vendor_id]})
        d4 = resp4.get_json() or {}
        if resp4.status_code == 200 and d4.get("success"):
            r("OK", "제조사 벤더 삭제(bulk-delete)")
        else:
            r("FAIL", "제조사 벤더 삭제(bulk-delete)", f"status={resp4.status_code}", "MEDIUM")

        # VERIFY DELETED
        resp5 = client.get(f"/api/vendor-manufacturers/{vendor_id}")
        if resp5.status_code in (404, 200):
            d5 = resp5.get_json() or {}
            deleted = d5.get("item", {}).get("is_deleted", False) if resp5.status_code == 200 else True
            r("OK" if deleted else "FAIL", "제조사 삭제 후 조회", f"status={resp5.status_code} is_deleted={deleted}")
    else:
        r("FAIL", "제조사 벤더 등록(POST)", f"status={resp.status_code} error={data.get('error','')}", "HIGH")

    # D2. 유지보수사 CRUD
    print("\n--- D2. 유지보수사 CRUD ---")
    payload2 = {"name": f"__QA_MAINT_{ts}", "code": f"QM{ts}", "remark": "QA 자동테스트"}
    resp = client.post("/api/vendor-maintenance", json=payload2)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        maint_id = (data.get("item") or {}).get("id")
        r("OK", "유지보수사 등록(POST)", f"id={maint_id}")
        resp_del = client.post("/api/vendor-maintenance/bulk-delete", json={"ids": [maint_id]})
        r("OK" if resp_del.status_code == 200 else "FAIL", "유지보수사 삭제")
    else:
        r("FAIL", "유지보수사 등록(POST)", f"status={resp.status_code} err={data.get('error','')}", "HIGH")

    # D3. 조직 회사 CRUD
    print("\n--- D3. 조직 회사 CRUD ---")
    payload3 = {"name": f"__QA_COMPANY_{ts}", "code": f"QC{ts}"}
    resp = client.post("/api/org-companies", json=payload3)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        company_id = (data.get("item") or {}).get("id")
        r("OK", "조직 회사 등록(POST)", f"id={company_id}")
        resp_del = client.post("/api/org-companies/bulk-delete", json={"ids": [company_id]})
        r("OK" if resp_del.status_code == 200 else "FAIL", "조직 회사 삭제")
    else:
        r("FAIL", "조직 회사 등록(POST)", f"status={resp.status_code} err={data.get('error','')}", "HIGH")

    # D4. 랙 CRUD
    print("\n--- D4. 랙 CRUD ---")
    center_resp = client.get("/api/org-centers?per_page=1")
    center_data = center_resp.get_json() or {}
    center_rows = center_data.get("rows", [])
    center_id = center_rows[0]["id"] if center_rows else None

    rack_payload = {"rack_name": f"__QA_RACK_{ts}", "rack_no": f"R{ts}", "center_id": center_id, "location": "A-01"}
    resp = client.post("/api/org-racks", json=rack_payload)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        rack_id = (data.get("item") or {}).get("id")
        r("OK", "랙 등록(POST)", f"id={rack_id}")
        resp_del = client.post("/api/org-racks/bulk-delete", json={"ids": [rack_id]})
        r("OK" if resp_del.status_code == 200 else "FAIL", "랙 삭제")
    else:
        r("FAIL", "랙 등록(POST)", f"status={resp.status_code} err={data.get('error','')}", "HIGH")

    # D5. IP 정책 CRUD
    print("\n--- D5. IP 정책 CRUD ---")
    ip_payload = {
        "policy_name": f"__QA_IP_{ts}",
        "ip_range": "10.99.99.0/24",
        "status": "active",
        "remark": "QA테스트"
    }
    resp = client.post("/api/network/ip-policies", json=ip_payload)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        ip_id = (data.get("item") or {}).get("id")
        r("OK", "IP 정책 등록(POST)", f"id={ip_id}")
        resp_del = client.post("/api/network/ip-policies/bulk-delete", json={"ids": [ip_id]})
        r("OK" if resp_del.status_code == 200 else "FAIL", "IP 정책 삭제")
    else:
        r("FAIL", "IP 정책 등록(POST)", f"status={resp.status_code} err={data.get('error','')}", "HIGH")

    # D6. 온프레미스 서버 CRUD
    print("\n--- D6. 온프레미스 서버 CRUD ---")
    server_payload = {
        "asset_name": f"__QA_SERVER_{ts}",
        "hostname": f"qa-srv-{ts}",
        "status": "운영",
        "os": "Linux"
    }
    resp = client.post("/api/hardware/onpremise/assets", json=server_payload)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        srv_id = (data.get("item") or {}).get("id")
        r("OK", "온프레미스 서버 등록(POST)", f"id={srv_id}")
        # 수정
        resp_upd = client.put(f"/api/hardware/onpremise/assets/{srv_id}", json={"remark": "QA수정"})
        d_upd = resp_upd.get_json() or {}
        r("OK" if resp_upd.status_code == 200 and d_upd.get("success") else "FAIL",
          "온프레미스 서버 수정(PUT)", f"status={resp_upd.status_code}")
        # 삭제
        resp_del = client.post("/api/hardware/onpremise/assets/bulk-delete", json={"ids": [srv_id]})
        r("OK" if resp_del.status_code == 200 else "FAIL", "온프레미스 서버 삭제")
    else:
        r("FAIL", "온프레미스 서버 등록(POST)", f"status={resp.status_code} err={data.get('error','')[:80]}", "HIGH")

    # D7. 방화벽 CRUD
    print("\n--- D7. 방화벽 CRUD ---")
    fw_payload = {
        "asset_name": f"__QA_FW_{ts}",
        "hostname": f"qa-fw-{ts}",
        "status": "운영"
    }
    resp = client.post("/api/hardware/security/firewall/assets", json=fw_payload)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        fw_id = (data.get("item") or {}).get("id")
        r("OK", "방화벽 등록(POST)", f"id={fw_id}")
        resp_del = client.post("/api/hardware/security/firewall/assets/bulk-delete", json={"ids": [fw_id]})
        r("OK" if resp_del.status_code == 200 else "FAIL", "방화벽 삭제")
    else:
        r("FAIL", "방화벽 등록(POST)", f"status={resp.status_code} err={data.get('error','')[:80]}", "HIGH")

    # D8. OPEX 계약 CRUD
    print("\n--- D8. OPEX 계약 CRUD ---")
    opex_payload = {
        "contract_name": f"__QA_OPEX_{ts}",
        "vendor_name": "QA벤더",
        "start_date": "2025-01-01",
        "end_date": "2025-12-31",
        "amount": 1000000
    }
    resp = client.post("/api/opex-contracts", json=opex_payload)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        opex_id = (data.get("item") or {}).get("id")
        r("OK", "OPEX 계약 등록(POST)", f"id={opex_id}")
        resp_del = client.post("/api/opex-contracts/bulk-delete", json={"ids": [opex_id]})
        r("OK" if resp_del.status_code == 200 else "FAIL", "OPEX 계약 삭제")
    else:
        r("FAIL", "OPEX 계약 등록(POST)", f"status={resp.status_code} err={data.get('error','')[:80]}", "HIGH")

    # D9. 프로젝트 CRUD
    print("\n--- D9. 프로젝트 CRUD ---")
    prj_payload = {
        "project_name": f"__QA_PRJ_{ts}",
        "status": "진행중",
        "start_date": "2025-01-01",
        "end_date": "2025-12-31"
    }
    resp = client.post("/api/prj/projects", json=prj_payload)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        prj_id = (data.get("item") or {}).get("id")
        r("OK", "프로젝트 등록(POST)", f"id={prj_id}")
        resp_del = client.post("/api/prj/projects/bulk-delete", json={"ids": [prj_id]})
        r("OK" if resp_del.status_code == 200 else "FAIL", "프로젝트 삭제")
    else:
        r("FAIL", "프로젝트 등록(POST)", f"status={resp.status_code} err={data.get('error','')[:80]}", "HIGH")

    # D10. 티켓 CRUD
    print("\n--- D10. 티켓 CRUD ---")
    ticket_payload = {
        "title": f"__QA_TICKET_{ts}",
        "category": "QA",
        "priority": "보통",
        "description": "QA 자동 테스트 티켓"
    }
    resp = client.post("/api/tickets", json=ticket_payload)
    data = resp.get_json() or {}
    if resp.status_code == 200 and data.get("success"):
        ticket_id = (data.get("item") or {}).get("id")
        r("OK", "티켓 등록(POST)", f"id={ticket_id}")
    else:
        r("FAIL", "티켓 등록(POST)", f"status={resp.status_code} err={data.get('error','')[:80]}", "HIGH")

    print("\n" + "="*70)
    print("PHASE E: 검색/필터/페이지네이션 테스트")
    print("="*70)

    SEARCH_TESTS = [
        ("/api/vendor-manufacturers", {"search": "", "page": 1, "per_page": 10}),
        ("/api/vendor-manufacturers", {"search": "nonexistent_999", "page": 1}),
        ("/api/vendor-manufacturers", {"page": 1, "per_page": 5}),
        ("/api/vendor-manufacturers", {"page": 999, "per_page": 10}),
        ("/api/org-companies", {"search": "", "page": 1, "per_page": 10}),
        ("/api/hardware/onpremise/assets", {"search": "", "page": 1, "per_page": 10}),
        ("/api/network/ip-policies", {"page": 1, "per_page": 10}),
        ("/api/opex-contracts", {"page": 1, "per_page": 5}),
    ]

    for url, params in SEARCH_TESTS:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        resp = client.get(f"{url}?{qs}")
        data = resp.get_json() or {}
        status = resp.status_code
        rows = len(data.get("rows", data.get("items", data.get("data", []))))
        total = data.get("total", 0)
        success = data.get("success", status == 200)
        tag = "OK" if status == 200 else "FAIL"
        sev = "INFO" if tag == "OK" else "MEDIUM"
        r(tag, f"검색 테스트: {url.split('/')[-1]}", f"params={params} → {status} rows={rows} total={total}", sev)

    print("\n" + "="*70)
    print("PHASE F: 필수값 검증 (Validation) 테스트")
    print("="*70)

    # 빈 이름으로 등록 시도
    resp = client.post("/api/vendor-manufacturers", json={"name": "", "code": ""})
    data = resp.get_json() or {}
    if resp.status_code in (400, 422) or (resp.status_code == 200 and not data.get("success")):
        r("OK", "제조사 빈 이름 거부", f"status={resp.status_code} success={data.get('success')}")
    else:
        r("FAIL", "제조사 빈 이름 미검증", f"status={resp.status_code} — 빈 이름이 허용됨", "HIGH")

    resp = client.post("/api/org-companies", json={"name": "", "code": ""})
    data = resp.get_json() or {}
    if resp.status_code in (400, 422) or (resp.status_code == 200 and not data.get("success")):
        r("OK", "회사 빈 이름 거부", f"status={resp.status_code}")
    else:
        r("FAIL", "회사 빈 이름 미검증", f"status={resp.status_code} — 빈 이름이 허용됨", "HIGH")

    # XSS 삽입 시도
    xss_payloads = ['<script>alert("xss")</script>', '"><img src=x onerror=alert(1)>']
    for xss in xss_payloads:
        resp = client.post("/api/vendor-manufacturers", json={"name": xss, "code": f"xss{ts}"})
        data = resp.get_json() or {}
        if resp.status_code == 200 and data.get("success"):
            item_name = (data.get("item") or {}).get("name", "")
            xss_id = (data.get("item") or {}).get("id")
            if "<script>" in item_name or "onerror=" in item_name:
                r("FAIL", "XSS 미필터링", f"name 필드에 스크립트 그대로 저장됨: {item_name[:50]}", "CRITICAL")
            else:
                r("OK", "XSS 입력값 저장", f"저장 허용이나 출력 이슈는 프론트에서 확인 필요")
            if xss_id:
                client.post("/api/vendor-manufacturers/bulk-delete", json={"ids": [xss_id]})
        else:
            r("OK", f"XSS 거부됨", f"status={resp.status_code}")

    print("\n" + "="*70)
    print("PHASE G: DB 스키마 이슈 점검")
    print("="*70)

    # biz_vendor_manufacturer 테이블
    resp = client.get("/api/cmp-cpu-types")
    data = resp.get_json() or {}
    if resp.status_code == 500:
        r("FAIL", "biz_vendor_manufacturer 테이블 없음", f"/api/cmp-cpu-types → 500: {data.get('error','')[:100]}", "CRITICAL")
    elif resp.status_code == 200:
        r("OK", "/api/cmp-cpu-types 응답")

    # access_permission 테이블
    resp = client.get("/api/datacenter/access/permissions")
    data = resp.get_json() or {}
    if resp.status_code == 500:
        r("FAIL", "access_permission 테이블 이슈", f"→ 500: {data.get('error','')[:100]}", "CRITICAL")
    elif resp.status_code == 200:
        r("OK", "/api/datacenter/access/permissions 응답")
    elif resp.status_code == 404:
        r("FAIL", "DC 출입 권한 API 없음", f"→ 404", "HIGH")

    print("\n" + "="*70)
    print("PHASE H: 권한 없는 API 엔드포인트 접근 (보안)")
    print("="*70)

    ADMIN_APIS = [
        "/api/org-users",
        "/api/auth/users",
        "/api/system/config",
        "/api/admin/settings",
        "/api/security-policies",
    ]
    with app.test_client() as anon2:
        for api_url in ADMIN_APIS:
            resp = anon2.get(api_url)
            if resp.status_code == 200:
                r("FAIL", f"인증 없이 접근 가능: {api_url}", f"→ 200 (401/403 expected)", "HIGH")
            else:
                r("OK", f"인증 차단 확인: {api_url}", f"→ {resp.status_code}")

    print("\n" + "="*70)
    print("PHASE I: 잘못된 ID 접근 테스트")
    print("="*70)

    INVALID_ID_TESTS = [
        ("온프레미스 서버", "/api/hardware/onpremise/assets/99999999"),
        ("방화벽", "/api/hardware/security/firewall/assets/99999999"),
        ("제조사", "/api/vendor-manufacturers/99999999"),
        ("IP 정책", "/api/network/ip-policies/99999999"),
        ("랙", "/api/org-racks/99999999"),
    ]
    for label, url in INVALID_ID_TESTS:
        resp = client.get(url)
        if resp.status_code == 404:
            r("OK", f"잘못된 ID 404 처리: {label}", url)
        elif resp.status_code == 200:
            data = resp.get_json() or {}
            item = data.get("item")
            if item is None:
                r("OK", f"잘못된 ID — item=null 반환: {label}", url)
            else:
                r("FAIL", f"잘못된 ID에 데이터 반환: {label}", f"{url} → item={item}", "MEDIUM")
        else:
            r("OK", f"잘못된 ID 처리 ({resp.status_code}): {label}", url)

# ──────────────────────────────────────────
print("\n" + "="*70)
print("FINAL SUMMARY")
print("="*70)
total = len(RESULTS)
ok_cnt = sum(1 for r in RESULTS if r["status"] == "OK")
fail_cnt = total - ok_cnt
critical = [r for r in RESULTS if r["status"] == "FAIL" and r["severity"] == "CRITICAL"]
high = [r for r in RESULTS if r["status"] == "FAIL" and r["severity"] == "HIGH"]
medium = [r for r in RESULTS if r["status"] == "FAIL" and r["severity"] == "MEDIUM"]

print(f"\n총 {total}개 항목 점검:")
print(f"  ✅ OK    : {ok_cnt}")
print(f"  🔴 FAIL  : {fail_cnt}")
print(f"     CRITICAL: {len(critical)}개")
print(f"     HIGH    : {len(high)}개")
print(f"     MEDIUM  : {len(medium)}개")

if critical:
    print("\n🔴 CRITICAL 이슈:")
    for item in critical:
        print(f"  - {item['name']}: {item['detail']}")
if high:
    print("\n🟠 HIGH 이슈:")
    for item in high:
        print(f"  - {item['name']}: {item['detail']}")
if medium:
    print("\n🟡 MEDIUM 이슈:")
    for item in medium:
        print(f"  - {item['name']}: {item['detail']}")

# JSON 저장
with open("_qa_deep_results.json", "w", encoding="utf-8") as f:
    json.dump({"summary": {"total": total, "ok": ok_cnt, "fail": fail_cnt,
                            "critical": len(critical), "high": len(high), "medium": len(medium)},
               "results": RESULTS}, f, ensure_ascii=False, indent=2)
print("\n결과 저장: _qa_deep_results.json")
