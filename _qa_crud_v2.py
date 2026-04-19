"""
QA CRUD 테스트 v2 - 올바른 API URL 사용
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

os.environ["TESTING"] = "1"
os.environ["SECRET_KEY"] = "qa-test-secret"

from app import create_app

app = create_app("testing")
client = app.test_client()

# ------ 인증 세션 ------
def login():
    from app.models import User
    with app.app_context():
        u = User.query.filter_by(role="admin").first()
        if not u:
            u = User.query.first()
        if not u:
            return False
    with client.session_transaction() as sess:
        sess["user_id"] = u.id
        sess["role"] = getattr(u, "role", "admin")
        sess["_fresh"] = True
    return True

login()

results = []

def test_api(label, method, url, payload=None, expected_status=None):
    if method == "GET":
        resp = client.get(url, content_type="application/json")
    elif method == "POST":
        resp = client.post(url, json=payload or {}, content_type="application/json")
    elif method == "PUT":
        resp = client.put(url, json=payload or {}, content_type="application/json")
    elif method == "DELETE":
        resp = client.delete(url, content_type="application/json")
    
    try:
        data = resp.get_json() or {}
    except Exception:
        data = {}
    
    status = resp.status_code
    success = data.get("success", None)
    rows = len(data.get("rows", data.get("items", [])))
    total = data.get("total", 0)
    error = data.get("error", "")
    
    ok = status in (expected_status or [200, 201])
    tag = "OK" if ok else f"FAIL({status})"
    
    result = {
        "label": label, "method": method, "url": url,
        "status": status, "success": success, "rows": rows, "total": total,
        "error": error[:80] if error else "", "ok": ok
    }
    results.append(result)
    print(f"  [{tag}] {method} {url} → {status} rows={rows} total={total}{' err=' + error[:60] if error else ''}")
    return result

print("=" * 70)
print("PHASE A: 하드웨어 자산 API (올바른 URL: /assets suffix)")
print("=" * 70)

hw_apis = [
    ("온프레미스 서버 목록", "/api/hardware/onpremise/assets"),
    ("클라우드 서버 목록",   "/api/hardware/cloud/assets"),
    ("Frame 서버 목록",      "/api/hardware/frame/assets"),
    ("Workstation 목록",     "/api/hardware/workstation/assets"),
    ("SAN 스토리지 목록",    "/api/hardware/storage/assets"),
    ("백업 스토리지 목록",   "/api/hardware/storage/backup/assets"),
    ("SAN Director 목록",    "/api/hardware/san/director/assets"),
    ("SAN Switch 목록",      "/api/hardware/san/switch/assets"),
    ("L2 스위치 목록",       "/api/hardware/network/l2/assets"),
    ("L4 스위치 목록",       "/api/hardware/network/l4/assets"),
    ("L7 스위치 목록",       "/api/hardware/network/l7/assets"),
    ("AP 목록",              "/api/hardware/network/ap/assets"),
    ("전용회선 목록",        "/api/hardware/network/circuit/assets"),
    ("방화벽 목록",          "/api/hardware/security/firewall/assets"),
    ("VPN 장비 목록",        "/api/hardware/security/vpn/assets"),
    ("IDS 목록",             "/api/hardware/security/ids/assets"),
    ("IPS 목록",             "/api/hardware/security/ips/assets"),
    ("HSM 목록",             "/api/hardware/security/hsm/assets"),
    ("KMS 목록",             "/api/hardware/security/kms/assets"),
    ("WIPS 목록",            "/api/hardware/security/wips/assets"),
    ("기타 보안장비 목록",   "/api/hardware/security/etc/assets"),
]

for label, url in hw_apis:
    test_api(label, "GET", url)

print()
print("=" * 70)
print("PHASE B: 거버넌스/네트워크 정책 API")
print("=" * 70)

gov_routes = []
# IP 정책
import re
text = open("app/routes/api.py", encoding="utf-8").read()
# Find ip-policy routes
ip_routes = re.findall(r"'(/api/[^']*ip[^']*)'", text)
vpn_routes = re.findall(r"'(/api/[^']*vpn[^']*)'", text)
leased_routes = re.findall(r"'(/api/[^']*leased[^']*)'", text)
unused_routes = re.findall(r"'(/api/[^']*unused[^']*)'", text)
access_routes = re.findall(r"'(/api/[^']*access[^']*)'", text)
data_del_routes = re.findall(r"'(/api/[^']*data.delet[^']*)'", text)
backup_routes = re.findall(r"'(/api/[^']*backup[^']*)'", text)
vuln_routes = re.findall(r"'(/api/[^']*vuln[^']*)'", text)
pkg_routes = re.findall(r"'(/api/[^']*package[^']*)'", text)

def dedup(lst):
    seen = set()
    out = []
    for x in lst:
        if x not in seen and "<" not in x:
            seen.add(x)
            out.append(x)
    return out

for url in dedup(ip_routes)[:5]:
    test_api(f"IP정책 GET {url}", "GET", url)
for url in dedup(vpn_routes)[:5]:
    test_api(f"VPN GET {url}", "GET", url)
for url in dedup(leased_routes)[:3]:
    test_api(f"전용회선 GET {url}", "GET", url)
for url in dedup(unused_routes)[:3]:
    test_api(f"미사용자산 GET {url}", "GET", url)
for url in dedup(access_routes)[:5]:
    test_api(f"접근권한 GET {url}", "GET", url)
for url in dedup(data_del_routes)[:3]:
    test_api(f"데이터삭제 GET {url}", "GET", url)
for url in dedup(backup_routes)[:5]:
    test_api(f"백업정책 GET {url}", "GET", url)
for url in dedup(vuln_routes)[:5]:
    test_api(f"취약점 GET {url}", "GET", url)
for url in dedup(pkg_routes)[:3]:
    test_api(f"패키지 GET {url}", "GET", url)

print()
print("=" * 70)
print("PHASE C: 비용/OPEX/CAPEX API")
print("=" * 70)

cost_routes = re.findall(r"'(/api/[^']*(?:cost|opex|capex)[^']*)'", text)
for url in dedup(cost_routes)[:10]:
    test_api(f"비용 GET {url}", "GET", url)

print()
print("=" * 70)
print("PHASE D: 카테고리/조직 API")
print("=" * 70)

cat_apis = [
    ("벤더 제조사 목록", "/api/vendor-manufacturers"),
    ("벤더 유지보수 목록", "/api/vendor-maintenances"),
    ("조직-회사 목록", "/api/org-companies"),
    ("고객사 목록", "/api/org-customers"),
    ("CPU 타입 목록", "/api/cmp-cpu-types"),
    ("GPU 타입 목록", "/api/cmp-gpu-types"),
    ("Memory 타입 목록", "/api/cmp-memory-types"),
    ("Disk 타입 목록", "/api/cmp-disk-types"),
    ("NIC 타입 목록", "/api/cmp-nic-types"),
    ("HBA 타입 목록", "/api/cmp-hba-types"),
    ("OS 타입 목록", "/api/sw-os-types"),
    ("DB 타입 목록", "/api/sw-db-types"),
    ("미들웨어 타입 목록", "/api/sw-middleware-types"),
    ("가상화 타입 목록", "/api/sw-virtualization-types"),
    ("보안SW 타입 목록", "/api/sw-security-types"),
    ("HA 타입 목록", "/api/sw-ha-types"),
    ("비즈니스 카테고리", "/api/work-categories"),
    ("비즈니스 부서", "/api/work-divisions"),
]

for label, url in cat_apis:
    test_api(label, "GET", url)

print()
print("=" * 70)
print("PHASE E: CRUD 생성/수정/삭제 (대표 도메인)")
print("=" * 70)

# 온프레미스 서버 CRUD
print("\n  -- 온프레미스 서버 CRUD --")
r = test_api("온프레미스 생성", "POST", "/api/hardware/onpremise/assets", {
    "hostname": "qa-test-svr-001", "status": "운영", "location": "DC-A"
}, [200, 201])
if r["ok"] or r["status"] in [200,201]:
    asset_id = (r.get("data") or {}).get("id")
    if asset_id:
        test_api("온프레미스 상세조회", "GET", f"/api/hardware/onpremise/assets/{asset_id}")
        test_api("온프레미스 수정", "PUT", f"/api/hardware/onpremise/assets/{asset_id}", {"hostname": "qa-test-svr-001-mod"})
        test_api("온프레미스 삭제", "POST", f"/api/hardware/onpremise/assets/bulk-delete", {"ids": [asset_id]})

# 방화벽 CRUD
print("\n  -- 방화벽 CRUD --")
r = test_api("방화벽 생성", "POST", "/api/hardware/security/firewall/assets", {
    "hostname": "qa-fw-001", "status": "운영"
}, [200, 201])

# 벤더 제조사 CRUD
print("\n  -- 벤더 제조사 CRUD --")
r = test_api("제조사 생성", "POST", "/api/vendor-manufacturers", {
    "name": "QA테스트제조사_임시", "code": "QATEST001"
}, [200, 201])
if r["ok"]:
    data = client.get("/api/vendor-manufacturers").get_json()
    mfr_id = next((x["id"] for x in (data.get("rows") or []) if x.get("name") == "QA테스트제조사_임시"), None)
    if mfr_id:
        test_api("제조사 수정", "PUT", f"/api/vendor-manufacturers/{mfr_id}", {"name": "QA테스트제조사_수정"})
        test_api("제조사 삭제", "POST", "/api/vendor-manufacturers/bulk-delete", {"ids": [mfr_id]})

# 조직-회사 CRUD
print("\n  -- 조직-회사 CRUD --")
test_api("회사 생성", "POST", "/api/org-companies", {
    "name": "QA테스트회사_임시", "company_type": "고객사"
}, [200, 201])

# Rack CRUD
print("\n  -- Rack CRUD --")
test_api("Rack 생성", "POST", "/api/org-racks", {
    "rack_name": "QA-RACK-001", "location": "DC-A", "total_u": 42
}, [200, 201])

# 인사이트 CRUD
print("\n  -- 인사이트 CRUD --")
test_api("인사이트 생성", "POST", "/api/insight/items", {
    "title": "QA테스트인사이트", "category": "IT"
}, [200, 201])

print()
print("=" * 70)
print("PHASE F: 인증 없는 페이지 접근 (보안 점검)")
print("=" * 70)

import flask
unauth_client = app.test_client()  # 세션 없음
pages_to_check = [
    "/p/dashboard", "/p/hw_server_onpremise", "/p/gov_backup_dashboard",
    "/p/cat_vendor_manufacturer", "/p/proj_status",
]
for url in pages_to_check:
    resp = unauth_client.get(url)
    expected_redirect = resp.status_code in (302, 401, 403)
    tag = "SECURE" if expected_redirect else f"UNAUTH_BYPASS({resp.status_code})"
    print(f"  [{tag}] {url}")

print()
print("=" * 70)
print("PHASE G: 404 처리 점검")
print("=" * 70)

test_api("존재하지 않는 페이지 키", "GET", "/p/nonexistent_page_key_xyz123", None, [404])
test_api("존재하지 않는 API", "GET", "/api/nonexistent_api_xyz", None, [404])
test_api("존재하지 않는 자산 ID", "GET", "/api/hardware/onpremise/assets/99999999", None, [404])

print()
print("=" * 70)
print("PHASE H: 검색/필터/페이지네이션 (대표 도메인)")
print("=" * 70)

test_api("벤더 검색(빈 검색어)", "GET", "/api/vendor-manufacturers?search=&page=1&per_page=10")
test_api("벤더 검색(키워드)", "GET", "/api/vendor-manufacturers?search=삼성&page=1&per_page=10")
test_api("벤더 검색(없는키워드)", "GET", "/api/vendor-manufacturers?search=XYZNONEXIST12345")
test_api("온프레미스 검색", "GET", "/api/hardware/onpremise/assets?search=test&page=1&per_page=10")
test_api("회사 검색", "GET", "/api/org-companies?search=test")
test_api("큰 페이지번호", "GET", "/api/vendor-manufacturers?page=9999&per_page=10")

print()
print("=" * 70)
print("PHASE I: XSS/SQL Injection 입력 테스트")
print("=" * 70)

xss_payloads = [
    {"name": "<script>alert('xss')</script>테스트"},
    {"name": "'; DROP TABLE org_company; --"},
    {"name": "{{7*7}}"},
    {"name": "${7*7}"},
]
for pl in xss_payloads:
    r = test_api(f"XSS테스트 payload={list(pl.values())[0][:30]}", "POST", "/api/vendor-manufacturers", pl)
    # 생성됐으면 즉시 삭제
    if r["status"] in [200, 201]:
        data = client.get("/api/vendor-manufacturers").get_json()
        bad_id = next((x["id"] for x in (data.get("rows") or []) if any(v in str(x.get("name","")) for v in ["script", "DROP", "7*7"])), None)
        if bad_id:
            client.post("/api/vendor-manufacturers/bulk-delete", json={"ids": [bad_id]})
            print(f"    [WARN] XSS payload was ACCEPTED and stored! id={bad_id}")

print()
print("=" * 70)
print("SUMMARY")
print("=" * 70)

ok_count = sum(1 for r in results if r["ok"])
fail_count = sum(1 for r in results if not r["ok"])
print(f"Total tests: {len(results)}")
print(f"  OK:   {ok_count}")
print(f"  FAIL: {fail_count}")

fails = [r for r in results if not r["ok"]]
if fails:
    print("\n실패 목록:")
    for r in fails:
        print(f"  [{r['status']}] {r['method']} {r['url']} - {r['error'][:60]}")
