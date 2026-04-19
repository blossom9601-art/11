"""
QA 전수 CRUD 테스트 v3 — conftest.py 패턴 사용
- 세션 키: emp_no, user_profile_id
- 보조 SQLite: shared_sqlite 하나에 모든 서비스 테이블 통합
"""
import os, sys, sqlite3, json, tempfile
from pathlib import Path
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
os.environ["TESTING"] = "1"
os.environ["SECRET_KEY"] = "qa-test-secret"

from app import create_app
from app.models import db as _db

SCHEMA_PATH = Path(__file__).resolve().parent / "scripts" / "sql" / "hardware_asset_schema.sql"

# ── 앱 & 테스트 DB 셋업 ──
tmp_dir = tempfile.mkdtemp()
shared_sqlite = os.path.join(tmp_dir, "qa_shared.sqlite")

app = create_app("testing")
os.makedirs(app.instance_path, exist_ok=True)

sqlite_uri = f"sqlite:///{shared_sqlite.replace(os.sep, '/')}"

# 모든 보조 SQLite 경로를 하나로 통일
SQLITE_KEYS = [
    'SW_OS_TYPE_SQLITE_PATH', 'SW_DB_TYPE_SQLITE_PATH',
    'SW_MIDDLEWARE_TYPE_SQLITE_PATH', 'SW_VIRTUAL_TYPE_SQLITE_PATH',
    'SW_SECURITY_TYPE_SQLITE_PATH', 'SW_HA_TYPE_SQLITE_PATH',
    'CMP_CPU_TYPE_SQLITE_PATH', 'CMP_GPU_TYPE_SQLITE_PATH',
    'CMP_MEMORY_TYPE_SQLITE_PATH', 'CMP_DISK_TYPE_SQLITE_PATH',
    'CMP_NIC_TYPE_SQLITE_PATH', 'CMP_HBA_TYPE_SQLITE_PATH',
    'CMP_ETC_TYPE_SQLITE_PATH', 'VENDOR_MANUFACTURER_SQLITE_PATH',
    'VENDOR_MAINTENANCE_SQLITE_PATH',
    'ORG_CENTER_SQLITE_PATH', 'ORG_RACK_SQLITE_PATH',
    'SYSTEM_LAB1_SURFACE_SQLITE_PATH', 'SYSTEM_LAB2_SURFACE_SQLITE_PATH',
    'SYSTEM_LAB3_SURFACE_SQLITE_PATH', 'SYSTEM_LAB4_SURFACE_SQLITE_PATH',
    'SOFTWARE_ASSET_SQLITE_PATH', 'SERVER_SOFTWARE_SQLITE_PATH',
    'NETWORK_IP_POLICY_SQLITE_PATH', 'NETWORK_DNS_POLICY_SQLITE_PATH',
    'NETWORK_AD_SQLITE_PATH',
    'ACCESS_ENTRY_REGISTER_SQLITE_PATH',
    'DATA_DELETE_REGISTER_SQLITE_PATH', 'DATA_DELETE_SYSTEM_SQLITE_PATH',
]
cfg_update = {'SQLALCHEMY_DATABASE_URI': sqlite_uri}
for k in SQLITE_KEYS:
    cfg_update[k] = shared_sqlite
app.config.update(cfg_update)

# ── 보조 스키마 적용 ──
def ensure_schema(db_path):
    if not os.path.exists(SCHEMA_PATH):
        return
    with sqlite3.connect(db_path) as conn:
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            conn.executescript(f.read())
        ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        try:
            conn.execute(
                "INSERT OR IGNORE INTO biz_work_status (status_code,status_name,status_level,created_at,created_by,updated_at,updated_by,is_deleted) VALUES (?,?,?,?,?,?,?,0)",
                ("ACTIVE","운영","success",ts,"test",ts,"test"))
            conn.execute(
                "INSERT OR IGNORE INTO biz_work_group (group_code,group_name,created_at,created_by,updated_at,updated_by,is_deleted) VALUES (?,?,?,?,?,?,0)",
                ("OPS","운영그룹",ts,"test",ts,"test"))
            conn.commit()
        except Exception:
            pass

# ── 서비스 테이블 초기화 ──
from app.services.sw_os_type_service import init_sw_os_type_table
from app.services.sw_db_type_service import init_sw_db_type_table
from app.services.sw_middleware_type_service import init_sw_middleware_type_table
from app.services.sw_virtual_type_service import init_sw_virtual_type_table
from app.services.sw_security_type_service import init_sw_security_type_table
from app.services.sw_high_availability_type_service import init_sw_ha_type_table
from app.services.cmp_cpu_type_service import init_cmp_cpu_type_table
from app.services.cmp_gpu_type_service import init_cmp_gpu_type_table
from app.services.cmp_memory_type_service import init_cmp_memory_type_table
from app.services.cmp_disk_type_service import init_cmp_disk_type_table
from app.services.cmp_nic_type_service import init_cmp_nic_type_table
from app.services.cmp_hba_type_service import init_cmp_hba_type_table
from app.services.cmp_etc_type_service import init_cmp_etc_type_table
from app.services.vendor_manufacturer_service import init_vendor_manufacturer_table
from app.services.org_center_service import init_org_center_table
from app.services.org_rack_service import init_org_rack_table
from app.services.system_lab1_surface_service import init_system_lab1_surface_table
from app.services.system_lab2_surface_service import init_system_lab2_surface_table
from app.services.system_lab3_surface_service import init_system_lab3_surface_table
from app.services.system_lab4_surface_service import init_system_lab4_surface_table
from app.services.software_asset_service import init_software_asset_table, INITIALIZED_DBS
from app.services.server_software_service import init_server_software_table
from app.services.network_ip_policy_service import init_network_ip_policy_table
from app.services.network_dns_policy_service import init_network_dns_policy_table
from app.services.network_dns_policy_log_service import init_network_dns_policy_log_table
from app.services.network_dns_record_service import init_network_dns_record_table
from app.services.network_dns_diagram_service import init_network_dns_diagram_table
from app.services.network_ip_diagram_service import init_network_ip_diagram_table
from app.services.network_ad_service import init_network_ad_account_tables, init_network_ad_table
from app.services.access_entry_register_service import init_access_entry_register_table
from app.services.data_delete_register_service import init_data_delete_register_table
from app.services.data_delete_system_service import init_data_delete_system_table

INITIALIZED_DBS.discard(os.path.abspath(shared_sqlite))

with app.app_context():
    _db.create_all()
    ensure_schema(shared_sqlite)
    init_vendor_manufacturer_table(app)
    init_sw_os_type_table(app)
    init_sw_db_type_table(app)
    init_sw_middleware_type_table(app)
    init_sw_virtual_type_table(app)
    init_sw_security_type_table(app)
    init_sw_ha_type_table(app)
    init_cmp_cpu_type_table(app)
    init_cmp_gpu_type_table(app)
    init_cmp_memory_type_table(app)
    init_cmp_disk_type_table(app)
    init_cmp_nic_type_table(app)
    init_cmp_hba_type_table(app)
    init_cmp_etc_type_table(app)
    init_org_center_table(app)
    init_org_rack_table(app)
    init_system_lab1_surface_table(app)
    init_system_lab2_surface_table(app)
    init_system_lab3_surface_table(app)
    init_system_lab4_surface_table(app)
    init_software_asset_table(app)
    init_server_software_table(app)
    init_network_dns_policy_table(app)
    init_network_dns_policy_log_table(app)
    init_network_dns_record_table(app)
    init_network_dns_diagram_table(app)
    init_network_ip_policy_table(app)
    init_network_ip_diagram_table(app)
    init_network_ad_table(app)
    init_network_ad_account_tables(app)
    init_access_entry_register_table(app)
    init_data_delete_register_table(app)
    init_data_delete_system_table(app)

    # Actor user 생성 (conftest 패턴)
    from app.models import UserProfile
    user = UserProfile.query.filter_by(emp_no='ACTOR001').first()
    if not user:
        user = UserProfile(emp_no='ACTOR001', name='QA Tester', department='IT', email='qa@example.com')
        _db.session.add(user)
        _db.session.commit()
    actor_id = user.id

# ── 인증 클라이언트 ──
client = app.test_client()
with client.session_transaction() as sess:
    sess['emp_no'] = 'ACTOR001'
    sess['user_profile_id'] = actor_id
    sess['user_id'] = actor_id
    sess['role'] = 'ADMIN'
    sess['_login_at'] = datetime.utcnow().isoformat()
    sess['_last_active'] = datetime.utcnow().isoformat()

# 비인증 클라이언트
unauth_client = app.test_client()

results = []
created_ids = {}  # 정리를 위해 생성 ID 추적

# ── 유틸 ──
def api_test(label, method, url, payload=None, expected=None, client_obj=None):
    c = client_obj or client
    kw = {"content_type": "application/json"}
    if method == "GET":
        resp = c.get(url, **kw)
    elif method == "POST":
        resp = c.post(url, json=payload or {}, **kw)
    elif method == "PUT":
        resp = c.put(url, json=payload or {}, **kw)
    elif method == "DELETE":
        resp = c.delete(url, **kw)
    else:
        return None

    try:
        data = resp.get_json(silent=True) or {}
    except Exception:
        data = {}

    status = resp.status_code
    success = data.get("success")
    rows = len(data.get("rows", data.get("items", [])))
    total = data.get("total", 0)
    error = str(data.get("error", ""))[:80]
    item = data.get("item") or data.get("data") or {}
    item_id = item.get("id") if isinstance(item, dict) else None

    expected = expected or [200, 201]
    ok = status in expected
    tag = "OK" if ok else f"FAIL({status})"

    r = {"label": label, "method": method, "url": url, "status": status,
         "success": success, "rows": rows, "total": total, "error": error,
         "ok": ok, "item_id": item_id}
    results.append(r)
    print(f"  [{tag}] {method} {url} → {status} s={success} rows={rows} total={total}{' E:'+error if error and not ok else ''}")
    return r

def page_test(label, key):
    resp = client.get(f"/p/{key}")
    ok = resp.status_code == 200
    tag = "OK" if ok else f"FAIL({resp.status_code})"
    r = {"label": label, "method": "PAGE", "url": f"/p/{key}", "status": resp.status_code,
         "ok": ok, "success": ok, "rows": 0, "total": 0, "error": "", "item_id": None}
    results.append(r)
    print(f"  [{tag}] PAGE /p/{key} → {resp.status_code} ({len(resp.data)} bytes)")
    return r

# ============================================================
print("=" * 72)
print("PHASE 1: 사이드바 전체 메뉴 페이지 진입 테스트")
print("=" * 72)

sidebar_pages = [
    ("대시보드", "dashboard"),
    ("서버(온프레미스)", "hw_server_onpremise"),
    ("스토리지", "hw_storage_san"),
    ("SAN", "hw_san_director"),
    ("네트워크", "hw_network_l2"),
    ("보안장비", "hw_security_firewall"),
    ("재해복구 모의훈련", "gov_dr_training"),
    ("백업 정책", "gov_backup_policy"),
    ("백업 대시보드", "gov_backup_dashboard"),
    ("IP 정책", "gov_ip_policy"),
    ("VPN 정책", "gov_vpn_policy"),
    ("전용회선 정책", "gov_dedicatedline_member"),
    ("불용자산 관리", "gov_unused_server"),
    ("출입 관리", "dc_access_control"),
    ("데이터 삭제 관리", "dc_data_deletion"),
    ("RACK 관리", "dc_rack_list"),
    ("온습도 관리", "dc_thermometer_list"),
    ("CCTV 관리", "dc_cctv_list"),
    ("유지보수-계약관리", "maint_contract_list"),
    ("프로젝트 현황", "proj_status"),
    ("작업 현황", "task_status"),
    ("티켓 현황", "workflow_progress"),
    ("워크플로우 제작", "wf_designer_explore"),
    ("OPEX 대시보드", "cost_opex_dashboard"),
    ("CAPEX 대시보드", "cost_capex_dashboard"),
    ("인사이트 트렌드", "insight_trend"),
    ("인사이트 블로그", "insight_blog_it"),
    ("카테고리-비즈니스", "cat_business_work"),
    ("카테고리-하드웨어", "cat_hw_server"),
    ("카테고리-소프트웨어", "cat_sw_os"),
    ("카테고리-컴포넌트", "cat_component_cpu"),
    ("카테고리-회사", "cat_company_company"),
    ("카테고리-고객", "cat_customer_client1"),
    ("카테고리-벤더", "cat_vendor_manufacturer"),
]

for label, key in sidebar_pages:
    page_test(label, key)

# ============================================================
print()
print("=" * 72)
print("PHASE 2: 하드웨어 자산 API 목록 조회 (21종)")
print("=" * 72)

hw_list_apis = [
    ("온프레미스서버", "/api/hardware/onpremise/assets"),
    ("클라우드서버", "/api/hardware/cloud/assets"),
    ("Frame서버", "/api/hardware/frame/assets"),
    ("Workstation", "/api/hardware/workstation/assets"),
    ("SAN스토리지", "/api/hardware/storage/assets"),
    ("백업스토리지", "/api/hardware/storage/backup/assets"),
    ("SAN Director", "/api/hardware/san/director/assets"),
    ("SAN Switch", "/api/hardware/san/switch/assets"),
    ("L2스위치", "/api/hardware/network/l2/assets"),
    ("L4스위치", "/api/hardware/network/l4/assets"),
    ("L7스위치", "/api/hardware/network/l7/assets"),
    ("AP", "/api/hardware/network/ap/assets"),
    ("회선", "/api/hardware/network/circuit/assets"),
    ("방화벽", "/api/hardware/security/firewall/assets"),
    ("VPN장비", "/api/hardware/security/vpn/assets"),
    ("IDS", "/api/hardware/security/ids/assets"),
    ("IPS", "/api/hardware/security/ips/assets"),
    ("HSM", "/api/hardware/security/hsm/assets"),
    ("KMS", "/api/hardware/security/kms/assets"),
    ("WIPS", "/api/hardware/security/wips/assets"),
    ("기타보안", "/api/hardware/security/etc/assets"),
]

for label, url in hw_list_apis:
    api_test(f"HW목록-{label}", "GET", url)

# ============================================================
print()
print("=" * 72)
print("PHASE 3: 카테고리/조직 API 목록 조회")
print("=" * 72)

cat_apis = [
    ("벤더 제조사", "/api/vendor-manufacturers"),
    ("조직-회사", "/api/org-companies"),
    ("조직-센터", "/api/org-centers"),
    ("조직-RACK", "/api/org-racks"),
    ("온습도", "/api/org-thermometers"),
    ("CCTV", "/api/org-cctvs"),
    ("CPU 타입", "/api/cmp-cpu-types"),
    ("GPU 타입", "/api/cmp-gpu-types"),
    ("Memory 타입", "/api/cmp-memory-types"),
    ("Disk 타입", "/api/cmp-disk-types"),
    ("NIC 타입", "/api/cmp-nic-types"),
    ("HBA 타입", "/api/cmp-hba-types"),
    ("기타 컴포넌트", "/api/cmp-etc-types"),
    ("OS 타입", "/api/sw-os-types"),
    ("DB 타입", "/api/sw-db-types"),
    ("미들웨어 타입", "/api/sw-middleware-types"),
    ("가상화 타입", "/api/sw-virtualization-types"),
    ("보안SW 타입", "/api/sw-security-types"),
    ("HA 타입", "/api/sw-ha-types"),
    ("비즈니스 업무분류", "/api/work-categories"),
    ("비즈니스 업무구분", "/api/work-divisions"),
    ("비즈니스 업무상태", "/api/work-statuses"),
    ("비즈니스 운영분류", "/api/work-operations"),
    ("비즈니스 그룹", "/api/work-groups"),
    ("인사이트", "/api/insight/items"),
]

for label, url in cat_apis:
    api_test(f"목록-{label}", "GET", url)

# ============================================================
print()
print("=" * 72)
print("PHASE 4: 프로젝트/티켓/백업/거버넌스 API 목록 조회")
print("=" * 72)

gov_prj_apis = [
    ("프로젝트", "/api/prj/projects"),
    ("티켓", "/api/tickets"),
    ("서버 백업정책", "/api/hardware/server/backup-policies"),
    ("서버 취약점", "/api/hardware/server/vulnerabilities"),
    ("불용자산", "/api/gov-unused/assets"),
]

for label, url in gov_prj_apis:
    api_test(f"목록-{label}", "GET", url)

# ============================================================
print()
print("=" * 72)
print("PHASE 5: CRUD 생성→조회→수정→삭제 (대표 6개 도메인)")
print("=" * 72)

# --- 벤더 제조사 CRUD ---
print("\n  --- 벤더 제조사 CRUD ---")
r = api_test("제조사 CREATE", "POST", "/api/vendor-manufacturers", {
    "name": "QA제조사_임시", "country": "한국", "website": "https://qa-test.example"
})
mfr_id = r.get("item_id")
if not mfr_id and r["ok"]:
    data = client.get("/api/vendor-manufacturers").get_json(silent=True) or {}
    for row in data.get("rows", []):
        if row.get("name") == "QA제조사_임시":
            mfr_id = row.get("id")
            break
if mfr_id:
    created_ids["vendor_mfr"] = mfr_id
    api_test("제조사 READ", "GET", f"/api/vendor-manufacturers/{mfr_id}")
    api_test("제조사 UPDATE", "PUT", f"/api/vendor-manufacturers/{mfr_id}", {"name": "QA제조사_수정"})
    api_test("제조사 BULK-DEL", "POST", "/api/vendor-manufacturers/bulk-delete", {"ids": [mfr_id]})
else:
    print(f"    [SKIP] 제조사 생성 실패 → READ/UPDATE/DELETE 건너뜀 (status={r['status']}, err={r['error']})")

# --- 온프레미스 서버 CRUD ---
print("\n  --- 온프레미스 서버 CRUD ---")
r = api_test("온프레미스 CREATE", "POST", "/api/hardware/onpremise/assets", {
    "hostname": "qa-svr-001", "ip_address": "10.0.0.99", "status": "운영",
    "os_name": "Linux", "data_center": "DC-A", "rack_location": "A01"
})
svr_id = r.get("item_id")
if not svr_id and r["ok"]:
    data = client.get("/api/hardware/onpremise/assets").get_json(silent=True) or {}
    for row in data.get("rows", []):
        if row.get("hostname") == "qa-svr-001":
            svr_id = row.get("id")
            break
if svr_id:
    created_ids["onpremise"] = svr_id
    api_test("온프레미스 READ", "GET", f"/api/hardware/onpremise/assets/{svr_id}")
    api_test("온프레미스 UPDATE", "PUT", f"/api/hardware/onpremise/assets/{svr_id}", {"hostname": "qa-svr-001-mod"})
    api_test("온프레미스 BULK-DEL", "POST", "/api/hardware/onpremise/assets/bulk-delete", {"ids": [svr_id]})
else:
    print(f"    [SKIP] 서버 생성 실패 (status={r['status']}, err={r['error']})")

# --- 방화벽 CRUD ---
print("\n  --- 방화벽 CRUD ---")
r = api_test("방화벽 CREATE", "POST", "/api/hardware/security/firewall/assets", {
    "hostname": "qa-fw-001", "ip_address": "10.0.1.1", "status": "운영"
})
fw_id = r.get("item_id")
if not fw_id and r["ok"]:
    data = client.get("/api/hardware/security/firewall/assets").get_json(silent=True) or {}
    for row in data.get("rows", []):
        if row.get("hostname") == "qa-fw-001":
            fw_id = row.get("id")
            break
if fw_id:
    created_ids["firewall"] = fw_id
    api_test("방화벽 READ", "GET", f"/api/hardware/security/firewall/assets/{fw_id}")
    api_test("방화벽 UPDATE", "PUT", f"/api/hardware/security/firewall/assets/{fw_id}", {"hostname": "qa-fw-001-mod"})
    api_test("방화벽 BULK-DEL", "POST", "/api/hardware/security/firewall/assets/bulk-delete", {"ids": [fw_id]})
else:
    print(f"    [SKIP] 방화벽 생성 실패 (status={r['status']}, err={r['error']})")

# --- RACK CRUD ---
print("\n  --- RACK CRUD ---")
r = api_test("RACK CREATE", "POST", "/api/org-racks", {
    "rack_name": "QA-RACK-01", "location": "DC-A", "total_u": 42
})
rack_id = r.get("item_id")
if not rack_id and r["ok"]:
    data = client.get("/api/org-racks").get_json(silent=True) or {}
    for row in data.get("rows", []):
        if row.get("rack_name") == "QA-RACK-01":
            rack_id = row.get("id")
            break
if rack_id:
    created_ids["rack"] = rack_id
    api_test("RACK READ", "GET", f"/api/org-racks/{rack_id}")
    api_test("RACK UPDATE", "PUT", f"/api/org-racks/{rack_id}", {"rack_name": "QA-RACK-01-mod"})
    api_test("RACK BULK-DEL", "POST", "/api/org-racks/bulk-delete", {"ids": [rack_id]})
else:
    print(f"    [SKIP] RACK 생성 실패 (status={r['status']}, err={r['error']})")

# --- CPU 타입 CRUD ---
print("\n  --- CPU 타입 CRUD ---")
r = api_test("CPU타입 CREATE", "POST", "/api/cmp-cpu-types", {
    "cpu_name": "QA-Xeon-Test", "cores": 8, "manufacturer_name": "Intel"
})
cpu_id = r.get("item_id")
if not cpu_id and r["ok"]:
    data = client.get("/api/cmp-cpu-types").get_json(silent=True) or {}
    for row in data.get("rows", []):
        if row.get("cpu_name") == "QA-Xeon-Test":
            cpu_id = row.get("id")
            break
if cpu_id:
    created_ids["cpu"] = cpu_id
    api_test("CPU타입 UPDATE", "PUT", f"/api/cmp-cpu-types/{cpu_id}", {"cpu_name": "QA-Xeon-Mod"})
    api_test("CPU타입 BULK-DEL", "POST", "/api/cmp-cpu-types/bulk-delete", {"ids": [cpu_id]})
else:
    print(f"    [SKIP] CPU 생성 실패 (status={r['status']}, err={r['error']})")

# --- 인사이트 CRUD ---
print("\n  --- 인사이트 CRUD ---")
r = api_test("인사이트 CREATE", "POST", "/api/insight/items", {
    "title": "QA테스트인사이트", "category": "IT", "content": "테스트 콘텐츠"
})
ins_id = r.get("item_id")
if ins_id:
    created_ids["insight"] = ins_id
    api_test("인사이트 READ", "GET", f"/api/insight/items/{ins_id}")
    api_test("인사이트 UPDATE", "PUT", f"/api/insight/items/{ins_id}", {"title": "QA수정인사이트"})
    api_test("인사이트 DELETE", "DELETE", f"/api/insight/items/{ins_id}")
else:
    print(f"    [SKIP] 인사이트 생성 실패 (status={r['status']}, err={r['error']})")

# ============================================================
print()
print("=" * 72)
print("PHASE 6: 검색/필터/페이지네이션 (대표 도메인)")
print("=" * 72)

api_test("벤더 빈검색", "GET", "/api/vendor-manufacturers?search=&page=1&per_page=10")
api_test("벤더 키워드검색", "GET", "/api/vendor-manufacturers?search=삼성")
api_test("벤더 없는키워드", "GET", "/api/vendor-manufacturers?search=ZZZNONEXIST")
api_test("벤더 큰페이지", "GET", "/api/vendor-manufacturers?page=9999&per_page=10")
api_test("온프레미스 검색", "GET", "/api/hardware/onpremise/assets?search=test&page=1&per_page=10")
api_test("회사 검색", "GET", "/api/org-companies?search=&page=1")
api_test("CPU 검색", "GET", "/api/cmp-cpu-types?search=xeon")

# ============================================================
print()
print("=" * 72)
print("PHASE 7: 보안 — 미인증 접근 테스트")
print("=" * 72)

unauth_pages = ["/p/dashboard", "/p/hw_server_onpremise", "/p/gov_backup_dashboard",
                "/p/cat_vendor_manufacturer", "/p/proj_status"]
for url in unauth_pages:
    resp = unauth_client.get(url)
    if resp.status_code in (302, 401, 403):
        tag = "SECURE"
    else:
        tag = f"UNAUTH_BYPASS({resp.status_code})"
    r = {"label": f"미인증-{url}", "method": "UNAUTH", "url": url, "status": resp.status_code,
         "ok": resp.status_code in (302, 401, 403), "success": False, "rows": 0, "total": 0, "error": "", "item_id": None}
    results.append(r)
    print(f"  [{tag}] {url} → {resp.status_code}")

unauth_apis = ["/api/hardware/onpremise/assets", "/api/vendor-manufacturers", "/api/prj/projects"]
for url in unauth_apis:
    resp = unauth_client.get(url, content_type="application/json")
    if resp.status_code in (302, 401, 403):
        tag = "SECURE"
    else:
        tag = f"API_UNAUTH({resp.status_code})"
    r = {"label": f"미인증API-{url}", "method": "UNAUTH", "url": url, "status": resp.status_code,
         "ok": resp.status_code in (302, 401, 403), "success": False, "rows": 0, "total": 0, "error": "", "item_id": None}
    results.append(r)
    print(f"  [{tag}] API {url} → {resp.status_code}")

# ============================================================
print()
print("=" * 72)
print("PHASE 8: 404 / Invalid Route / XSS 입력 테스트")
print("=" * 72)

api_test("없는페이지키", "GET", "/p/nonexistent_page_key_xyz", expected=[404])
api_test("없는API", "GET", "/api/nonexistent_xyz", expected=[404])
api_test("없는자산ID", "GET", "/api/hardware/onpremise/assets/99999999", expected=[404])
api_test("음수ID", "GET", "/api/hardware/onpremise/assets/-1", expected=[404])

# XSS 입력
xss_payloads = [
    '<script>alert("xss")</script>',
    '"><img src=x onerror=alert(1)>',
    "'; DROP TABLE users; --",
]
for pl in xss_payloads:
    r = api_test(f"XSS({pl[:20]})", "POST", "/api/vendor-manufacturers", {"name": pl})
    if r.get("item_id"):
        client.post("/api/vendor-manufacturers/bulk-delete", json={"ids": [r["item_id"]]})
        print(f"    [WARN] XSS payload ACCEPTED → cleaned up id={r['item_id']}")

# ============================================================
print()
print("=" * 72)
print("PHASE 9: 템플릿 파일 존재 확인 (TEMPLATE_MAP vs 실제 파일)")
print("=" * 72)

from app.routes.pages import TEMPLATE_MAP
template_base = os.path.join(os.path.dirname(__file__), "app", "templates")
missing_tab_count = 0
existing_count = 0
for key, val in sorted(TEMPLATE_MAP.items()):
    if isinstance(val, dict):
        tpl = val.get("template", "")
    elif isinstance(val, tuple):
        tpl = val[0] if val else ""
    else:
        tpl = str(val)
    if not tpl:
        continue
    full = os.path.join(template_base, tpl)
    if os.path.exists(full):
        existing_count += 1
    else:
        missing_tab_count += 1

print(f"  TEMPLATE_MAP 총 키: {len(TEMPLATE_MAP)}")
print(f"  파일 존재: {existing_count}")
print(f"  파일 누락: {missing_tab_count}")

# ============================================================
print()
print("=" * 72)
print("===  QA 테스트 최종 요약  ===")
print("=" * 72)

ok_count = sum(1 for r in results if r["ok"])
fail_count = sum(1 for r in results if not r["ok"])
total_count = len(results)

print(f"\n총 테스트: {total_count}")
print(f"  OK: {ok_count}")
print(f"  FAIL: {fail_count}")

# 카테고리별 집계
phases = {
    "PAGE": [r for r in results if r["method"] == "PAGE"],
    "GET": [r for r in results if r["method"] == "GET"],
    "POST": [r for r in results if r["method"] == "POST"],
    "PUT": [r for r in results if r["method"] == "PUT"],
    "DELETE": [r for r in results if r["method"] == "DELETE"],
    "UNAUTH": [r for r in results if r["method"] == "UNAUTH"],
}

print("\n카테고리별:")
for cat, items in phases.items():
    if not items:
        continue
    ok = sum(1 for i in items if i["ok"])
    fail = sum(1 for i in items if not i["ok"])
    print(f"  {cat}: {ok} OK / {fail} FAIL (total {len(items)})")

if fail_count:
    print(f"\n실패 상세 목록:")
    for r in results:
        if not r["ok"]:
            print(f"  [{r['status']}] {r['method']} {r['url']} — {r['error'][:60]}")

# 정리
try:
    import shutil
    shutil.rmtree(tmp_dir, ignore_errors=True)
except Exception:
    pass

print("\n[QA COMPLETE]")
