#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사이드바 전체 메뉴 CRUD QA 테스트
- Flask test_client 기반
- 인증 세션 주입
- 각 API 도메인별 목록/등록/수정/삭제 실행
- 결과를 구조화해 출력
"""
import json
import os
import sqlite3
import sys
import traceback
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

# ──────────────────────────────────────────────
#  결과 저장소
# ──────────────────────────────────────────────
results = []   # list of dicts

def _ok(menu, api, action, note=""):
    results.append({"menu": menu, "api": api, "action": action, "status": "OK", "note": note})

def _fail(menu, api, action, note=""):
    results.append({"menu": menu, "api": api, "action": action, "status": "FAIL", "note": note})

def _warn(menu, api, action, note=""):
    results.append({"menu": menu, "api": api, "action": action, "status": "WARN", "note": note})


# ──────────────────────────────────────────────
#  Flask 앱 초기화 (Testing 모드)
# ──────────────────────────────────────────────
import tempfile, shutil

TMP_DIR = Path(tempfile.mkdtemp(prefix="blossom_qa_"))
SHARED_DB = str(TMP_DIR / "test_shared.sqlite")
SCHEMA_PATH = BASE / "scripts" / "sql" / "hardware_asset_schema.sql"

def _apply_schema(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        if SCHEMA_PATH.exists():
            conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("""INSERT OR IGNORE INTO biz_work_status
            (status_code,status_name,status_level,created_at,created_by,updated_at,updated_by,is_deleted)
            VALUES ('ACTIVE','운영','success',?,?,?,?,0)""", (ts,"test",ts,"test"))
        conn.execute("""INSERT OR IGNORE INTO biz_work_group
            (group_code,group_name,created_at,created_by,updated_at,updated_by,is_deleted)
            VALUES ('OPS','운영그룹',?,?,?,?,0)""", (ts,"test",ts,"test"))
        conn.commit()

from app import create_app
from app.models import db as _db, UserProfile

print("[QA] 앱 초기화 중...", flush=True)
flask_app = create_app("testing")
flask_app.config.update({
    "SQLALCHEMY_DATABASE_URI": f"sqlite:///{SHARED_DB.replace(os.sep,'/')}",
    "SW_OS_TYPE_SQLITE_PATH": SHARED_DB,
    "SW_DB_TYPE_SQLITE_PATH": SHARED_DB,
    "SW_MIDDLEWARE_TYPE_SQLITE_PATH": SHARED_DB,
    "SW_VIRTUAL_TYPE_SQLITE_PATH": SHARED_DB,
    "SW_SECURITY_TYPE_SQLITE_PATH": SHARED_DB,
    "SW_HA_TYPE_SQLITE_PATH": SHARED_DB,
    "CMP_CPU_TYPE_SQLITE_PATH": SHARED_DB,
    "CMP_GPU_TYPE_SQLITE_PATH": SHARED_DB,
    "CMP_MEMORY_TYPE_SQLITE_PATH": SHARED_DB,
    "CMP_DISK_TYPE_SQLITE_PATH": SHARED_DB,
    "CMP_NIC_TYPE_SQLITE_PATH": SHARED_DB,
    "CMP_HBA_TYPE_SQLITE_PATH": SHARED_DB,
    "CMP_ETC_TYPE_SQLITE_PATH": SHARED_DB,
    "VENDOR_MANUFACTURER_SQLITE_PATH": SHARED_DB,
    "ORG_CENTER_SQLITE_PATH": SHARED_DB,
    "ORG_RACK_SQLITE_PATH": SHARED_DB,
    "SYSTEM_LAB1_SURFACE_SQLITE_PATH": SHARED_DB,
    "SYSTEM_LAB2_SURFACE_SQLITE_PATH": SHARED_DB,
    "SYSTEM_LAB3_SURFACE_SQLITE_PATH": SHARED_DB,
    "SYSTEM_LAB4_SURFACE_SQLITE_PATH": SHARED_DB,
    "SOFTWARE_ASSET_SQLITE_PATH": SHARED_DB,
    "SERVER_SOFTWARE_SQLITE_PATH": SHARED_DB,
    "NETWORK_IP_POLICY_SQLITE_PATH": SHARED_DB,
    "NETWORK_DNS_POLICY_SQLITE_PATH": SHARED_DB,
    "NETWORK_AD_SQLITE_PATH": SHARED_DB,
    "ACCESS_ENTRY_REGISTER_SQLITE_PATH": SHARED_DB,
    "DATA_DELETE_REGISTER_SQLITE_PATH": SHARED_DB,
    "DATA_DELETE_SYSTEM_SQLITE_PATH": SHARED_DB,
})

# ──────────────────────────────────────────────
#  DB + 서비스 초기화
# ──────────────────────────────────────────────
with flask_app.app_context():
    _db.create_all()
    _apply_schema(SHARED_DB)
    from app.services.vendor_manufacturer_service import init_vendor_manufacturer_table
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
    from app.services.org_center_service import init_org_center_table
    from app.services.org_rack_service import init_org_rack_table
    from app.services.system_lab1_surface_service import init_system_lab1_surface_table
    from app.services.system_lab2_surface_service import init_system_lab2_surface_table
    from app.services.system_lab3_surface_service import init_system_lab3_surface_table
    from app.services.system_lab4_surface_service import init_system_lab4_surface_table
    from app.services.software_asset_service import init_software_asset_table
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

    for fn in [
        init_vendor_manufacturer_table, init_sw_os_type_table, init_sw_db_type_table,
        init_sw_middleware_type_table, init_sw_virtual_type_table, init_sw_security_type_table,
        init_sw_ha_type_table, init_cmp_cpu_type_table, init_cmp_gpu_type_table,
        init_cmp_memory_type_table, init_cmp_disk_type_table, init_cmp_nic_type_table,
        init_cmp_hba_type_table, init_cmp_etc_type_table, init_org_center_table,
        init_org_rack_table, init_system_lab1_surface_table, init_system_lab2_surface_table,
        init_system_lab3_surface_table, init_system_lab4_surface_table, init_software_asset_table,
        init_server_software_table, init_network_dns_policy_table, init_network_dns_policy_log_table,
        init_network_dns_record_table, init_network_dns_diagram_table, init_network_ip_policy_table,
        init_network_ip_diagram_table, init_network_ad_table, init_network_ad_account_tables,
        init_access_entry_register_table, init_data_delete_register_table, init_data_delete_system_table,
    ]:
        try:
            fn(flask_app)
        except Exception:
            pass

    # 관리자 사용자 생성
    admin = UserProfile.query.filter_by(emp_no="QA_ADMIN").first()
    if not admin:
        admin = UserProfile(
            emp_no="QA_ADMIN", name="QA 관리자", department="IT",
            email="qa@example.com",
        )
        _db.session.add(admin)
        _db.session.commit()
    ADMIN_USER_ID = admin.id

print(f"[QA] DB 초기화 완료. admin_id={ADMIN_USER_ID}", flush=True)

# ──────────────────────────────────────────────
#  클라이언트 헬퍼
# ──────────────────────────────────────────────
client = flask_app.test_client()
with client.session_transaction() as sess:
    sess["emp_no"] = "QA_ADMIN"
    sess["user_id"] = ADMIN_USER_ID
    sess["user_profile_id"] = ADMIN_USER_ID
    sess["is_admin"] = True
    sess["role"] = "ADMIN"

def get(url, **kw):
    return client.get(url, **kw)

def post(url, data, **kw):
    return client.post(url, data=json.dumps(data),
                       content_type="application/json", **kw)

def put(url, data, **kw):
    return client.put(url, data=json.dumps(data),
                      content_type="application/json", **kw)

def delete(url, **kw):
    return client.delete(url, **kw)

def post_bulk_delete(url, ids):
    return client.post(url, data=json.dumps({"ids": ids}),
                       content_type="application/json")

def check_list(r, menu, api):
    """GET 목록 응답 검증"""
    if r.status_code != 200:
        _fail(menu, api, "목록조회", f"HTTP {r.status_code}")
        return None
    try:
        d = r.get_json()
    except Exception:
        _fail(menu, api, "목록조회", "JSON 파싱 실패")
        return None
    if d is None:
        _fail(menu, api, "목록조회", "응답 없음(None)")
        return None
    if not d.get("success", True):  # success=false 이면 실패
        if "success" in d and d["success"] is False:
            _fail(menu, api, "목록조회", d.get("error") or d.get("message","응답 success=false"))
            return None
    _ok(menu, api, "목록조회", f"rows={len(d.get('rows',d.get('items',[])))}, total={d.get('total','-')}")
    return d

def check_create(r, menu, api, payload_desc=""):
    if r.status_code not in (200, 201):
        _fail(menu, api, "등록", f"HTTP {r.status_code} {payload_desc}")
        return None
    try:
        d = r.get_json()
    except Exception:
        _fail(menu, api, "등록", "JSON 파싱 실패")
        return None
    if not d or d.get("success") is False:
        _fail(menu, api, "등록", d.get("error") or d.get("message","success=false") if d else "null 응답")
        return None
    item = d.get("item") or d.get("data") or {}
    item_id = item.get("id") if isinstance(item, dict) else None
    _ok(menu, api, "등록", f"id={item_id}")
    return item_id

def check_update(r, menu, api):
    if r.status_code not in (200, 204):
        _fail(menu, api, "수정", f"HTTP {r.status_code}")
        return False
    d = r.get_json()
    if d and d.get("success") is False:
        _fail(menu, api, "수정", d.get("error") or "success=false")
        return False
    _ok(menu, api, "수정")
    return True

def check_delete(r, menu, api):
    if r.status_code not in (200, 204):
        _fail(menu, api, "삭제", f"HTTP {r.status_code}")
        return False
    d = r.get_json()
    if d and d.get("success") is False:
        _fail(menu, api, "삭제", d.get("error") or "success=false")
        return False
    _ok(menu, api, "삭제")
    return True

def page_render(menu, url):
    """페이지 렌더링 200 확인"""
    try:
        r = get(url)
        if r.status_code == 200:
            _ok(menu, url, "페이지진입")
        elif r.status_code == 302:
            _warn(menu, url, "페이지진입", f"Redirect→{r.headers.get('Location','?')}")
        else:
            _fail(menu, url, "페이지진입", f"HTTP {r.status_code}")
    except Exception as e:
        _fail(menu, url, "페이지진입", str(e))


# ══════════════════════════════════════════════
#  1. 대시보드
# ══════════════════════════════════════════════
print("[QA] 1. 대시보드", flush=True)
page_render("대시보드", "/p/dashboard")
r = get("/api/dashboard")
if r.status_code == 200:
    _ok("대시보드", "/api/dashboard", "목록조회")
elif r.status_code == 404:
    _warn("대시보드", "/api/dashboard", "목록조회", "엔드포인트 없음(별도 API 없을 수 있음)")
else:
    _fail("대시보드", "/api/dashboard", "목록조회", f"HTTP {r.status_code}")


# ══════════════════════════════════════════════
#  2. 시스템 > 서버 (온프레미스)
# ══════════════════════════════════════════════
print("[QA] 2. 시스템 > 서버 (온프레미스)", flush=True)
MENU = "시스템>서버(온프레미스)"
page_render(MENU, "/p/hw_server_onpremise")

# 목록
r = get("/api/hardware/onpremise/assets")
d = check_list(r, MENU, "/api/hardware/onpremise/assets")

# 등록
payload = {
    "hostname": "QA-SERVER-001", "asset_code": "QA-SV-001",
    "ip_address": "10.0.0.1", "os_type": "Linux", "status": "운영",
    "cpu_model": "Intel Xeon", "cpu_count": 2, "cpu_core": 8,
    "memory_gb": 32, "description": "QA테스트 서버",
}
r = post("/api/hardware/onpremise/assets", payload)
sv_id = check_create(r, MENU, "/api/hardware/onpremise/assets", "기본 서버")

# 수정
if sv_id:
    r = put(f"/api/hardware/onpremise/assets/{sv_id}", {"hostname": "QA-SERVER-001-U", "description": "수정됨"})
    check_update(r, MENU, f"/api/hardware/onpremise/assets/{sv_id}")

# 상세 조회
if sv_id:
    r = get(f"/api/hardware/onpremise/assets/{sv_id}")
    if r.status_code == 200 and r.get_json():
        _ok(MENU, f"/api/hardware/onpremise/assets/{sv_id}", "상세조회")
    else:
        _fail(MENU, f"/api/hardware/onpremise/assets/{sv_id}", "상세조회", f"HTTP {r.status_code}")

# 삭제
if sv_id:
    r = post_bulk_delete("/api/hardware/onpremise/assets/bulk-delete", [sv_id])
    check_delete(r, MENU, "bulk-delete")

# 서버 계정 탭
page_render(MENU, "/p/hw_server_onpremise_account")
page_render(MENU, "/p/hw_server_onpremise_sw")
page_render(MENU, "/p/hw_server_onpremise_backup")
page_render(MENU, "/p/hw_server_onpremise_vulnerability")


# ══════════════════════════════════════════════
#  3. 시스템 > 서버 (클라우드)
# ══════════════════════════════════════════════
print("[QA] 3. 시스템 > 서버 (클라우드)", flush=True)
MENU = "시스템>서버(클라우드)"
page_render(MENU, "/p/hw_server_cloud")
r = get("/api/hardware/cloud/assets")
d = check_list(r, MENU, "/api/hardware/cloud/assets")
payload = {
    "hostname": "QA-CLOUD-001", "asset_code": "QA-CL-001",
    "ip_address": "10.1.0.1", "os_type": "Linux", "status": "운영",
    "cloud_provider": "AWS", "instance_type": "t3.medium",
}
r = post("/api/hardware/cloud/assets", payload)
cl_id = check_create(r, MENU, "/api/hardware/cloud/assets")
if cl_id:
    r = put(f"/api/hardware/cloud/assets/{cl_id}", {"hostname": "QA-CLOUD-001-U"})
    check_update(r, MENU, f"/api/hardware/cloud/assets/{cl_id}")
    r = post_bulk_delete("/api/hardware/cloud/assets/bulk-delete", [cl_id])
    check_delete(r, MENU, "bulk-delete")


# ══════════════════════════════════════════════
#  4. 시스템 > 스토리지
# ══════════════════════════════════════════════
print("[QA] 4. 시스템 > 스토리지", flush=True)
MENU = "시스템>스토리지"
page_render(MENU, "/p/hw_storage_san")
r = get("/api/hardware/storage/assets")
d = check_list(r, MENU, "/api/hardware/storage/assets")
payload = {
    "hostname": "QA-STORAGE-001", "asset_code": "QA-ST-001",
    "status": "운영", "vendor": "NetApp", "model": "AFF A300",
    "total_capacity_tb": 50,
}
r = post("/api/hardware/storage/assets", payload)
st_id = check_create(r, MENU, "/api/hardware/storage/assets")
if st_id:
    r = put(f"/api/hardware/storage/assets/{st_id}", {"hostname": "QA-STORAGE-001-U"})
    check_update(r, MENU, f"/api/hardware/storage/assets/{st_id}")
    r = post_bulk_delete("/api/hardware/storage/assets/bulk-delete", [st_id])
    check_delete(r, MENU, "bulk-delete")


# ══════════════════════════════════════════════
#  5. 시스템 > SAN (Director)
# ══════════════════════════════════════════════
print("[QA] 5. 시스템 > SAN", flush=True)
MENU = "시스템>SAN(Director)"
page_render(MENU, "/p/hw_san_director")
r = get("/api/hardware/san/director/assets")
d = check_list(r, MENU, "/api/hardware/san/director/assets")
payload = {
    "hostname": "QA-SAN-DIR-001", "asset_code": "QA-SD-001",
    "status": "운영", "vendor": "Brocade", "model": "DCX 8510",
}
r = post("/api/hardware/san/director/assets", payload)
sd_id = check_create(r, MENU, "/api/hardware/san/director/assets")
if sd_id:
    r = put(f"/api/hardware/san/director/assets/{sd_id}", {"hostname": "QA-SAN-DIR-001-U"})
    check_update(r, MENU, f"/api/hardware/san/director/assets/{sd_id}")
    r = post_bulk_delete("/api/hardware/san/director/assets/bulk-delete", [sd_id])
    check_delete(r, MENU, "bulk-delete")


# ══════════════════════════════════════════════
#  6. 시스템 > 네트워크 (L2/L4/L7/AP/전용회선)
# ══════════════════════════════════════════════
print("[QA] 6. 시스템 > 네트워크", flush=True)
for nw_type in ["l2", "l4", "l7", "ap", "circuit"]:
    MENU = f"시스템>네트워크({nw_type.upper()})"
    page_key = {"l2": "hw_network_l2", "l4": "hw_network_l4", "l7": "hw_network_l7",
                "ap": "hw_network_ap", "circuit": "hw_network_dedicateline"}[nw_type]
    page_render(MENU, f"/p/{page_key}")
    api = f"/api/hardware/network/{nw_type}/assets"
    r = get(api)
    d = check_list(r, MENU, api)
    payload = {
        "hostname": f"QA-NW-{nw_type.upper()}-001", "asset_code": f"QA-NW-{nw_type.upper()}-001",
        "status": "운영", "vendor": "Cisco",
    }
    r = post(api, payload)
    nw_id = check_create(r, MENU, api)
    if nw_id:
        r = put(f"{api}/{nw_id}", {"hostname": f"QA-NW-{nw_type.upper()}-001-U"})
        check_update(r, MENU, f"{api}/{nw_id}")
        r = post_bulk_delete(f"{api}/bulk-delete", [nw_id])
        check_delete(r, MENU, "bulk-delete")


# ══════════════════════════════════════════════
#  7. 시스템 > 보안장비
# ══════════════════════════════════════════════
print("[QA] 7. 시스템 > 보안장비", flush=True)
security_types = [
    ("firewall", "hw_security_firewall"),
    ("vpn", "hw_security_vpn"),
    ("ids", "hw_security_ids"),
    ("ips", "hw_security_ips"),
    ("hsm", "hw_security_hsm"),
    ("kms", "hw_security_kms"),
    ("wips", "hw_security_wips"),
]
for sec_type, page_key in security_types:
    MENU = f"시스템>보안장비({sec_type.upper()})"
    page_render(MENU, f"/p/{page_key}")
    api = f"/api/hardware/security/{sec_type}/assets"
    r = get(api)
    d = check_list(r, MENU, api)
    payload = {
        "hostname": f"QA-SEC-{sec_type.upper()}-001",
        "asset_code": f"QA-SEC-{sec_type.upper()}-001",
        "status": "운영", "vendor": "Palo Alto",
    }
    r = post(api, payload)
    sec_id = check_create(r, MENU, api)
    if sec_id:
        r = put(f"{api}/{sec_id}", {"hostname": f"QA-SEC-{sec_type.upper()}-001-U"})
        check_update(r, MENU, f"{api}/{sec_id}")
        r = post_bulk_delete(f"{api}/bulk-delete", [sec_id])
        check_delete(r, MENU, "bulk-delete")


# ══════════════════════════════════════════════
#  8. 거버넌스 > 백업 정책
# ══════════════════════════════════════════════
print("[QA] 8. 거버넌스 > 백업 정책", flush=True)
MENU = "거버넌스>백업정책"
page_render(MENU, "/p/gov_backup_dashboard")
page_render(MENU, "/p/gov_backup_policy")

# 스토리지 풀
r = get("/api/governance/backup/storage-pools")
check_list(r, MENU, "/api/governance/backup/storage-pools")
r = post("/api/governance/backup/storage-pools", {
    "pool_name": "QA 풀", "pool_type": "Disk", "capacity_tb": 10.0, "description": "QA 테스트"
})
pool_id = check_create(r, MENU, "/api/governance/backup/storage-pools")
if pool_id:
    r = put(f"/api/governance/backup/storage-pools/{pool_id}", {"pool_name": "QA 풀 수정"})
    check_update(r, MENU, f"pool/{pool_id}")
    r = post_bulk_delete("/api/governance/backup/storage-pools/bulk-delete", [pool_id])
    check_delete(r, MENU, "pool bulk-delete")

# 백업 대상 정책
r = get("/api/governance/backup/target-policies")
check_list(r, MENU, "/api/governance/backup/target-policies")
r = post("/api/governance/backup/target-policies", {
    "policy_name": "QA 정책", "backup_type": "Full",
    "schedule_period": "DAILY", "retention_days": 30,
    "start_time": "02:00", "description": "QA 테스트 정책",
})
policy_id = check_create(r, MENU, "/api/governance/backup/target-policies")
if policy_id:
    r = put(f"/api/governance/backup/target-policies/{policy_id}", {"policy_name": "QA 정책 수정"})
    check_update(r, MENU, f"policy/{policy_id}")
    r = post_bulk_delete("/api/governance/backup/target-policies/bulk-delete", [policy_id])
    check_delete(r, MENU, "policy bulk-delete")


# ══════════════════════════════════════════════
#  9. 거버넌스 > 패키지 관리
# ══════════════════════════════════════════════
print("[QA] 9. 거버넌스 > 패키지 관리", flush=True)
MENU = "거버넌스>패키지관리"
page_render(MENU, "/p/gov_package_dashboard")
page_render(MENU, "/p/gov_package_list")
r = get("/api/governance/packages")
check_list(r, MENU, "/api/governance/packages")
r = get("/api/governance/package-dashboard")
if r.status_code == 200:
    _ok(MENU, "/api/governance/package-dashboard", "대시보드조회")
else:
    _fail(MENU, "/api/governance/package-dashboard", "대시보드조회", f"HTTP {r.status_code}")


# ══════════════════════════════════════════════
#  10. 거버넌스 > 취약점 분석
# ══════════════════════════════════════════════
print("[QA] 10. 거버넌스 > 취약점 분석", flush=True)
MENU = "거버넌스>취약점분석"
page_render(MENU, "/p/gov_vulnerability_dashboard")
page_render(MENU, "/p/gov_vulnerability_guide")

r = get("/api/governance/vulnerability-guides")
check_list(r, MENU, "/api/governance/vulnerability-guides")

r = post("/api/governance/vulnerability-guides", {
    "title": "QA 취약점 가이드", "category": "보안", "severity": "High",
    "description": "QA 테스트 가이드", "solution": "패치 적용",
})
guide_id = check_create(r, MENU, "/api/governance/vulnerability-guides")
if guide_id:
    r = put(f"/api/governance/vulnerability-guides/{guide_id}", {"title": "QA 취약점 가이드 수정"})
    check_update(r, MENU, f"guide/{guide_id}")
    r = delete(f"/api/governance/vulnerability-guides/{guide_id}")
    check_delete(r, MENU, f"guide DELETE {guide_id}")


# ══════════════════════════════════════════════
#  11. 거버넌스 > IP 정책
# ══════════════════════════════════════════════
print("[QA] 11. 거버넌스 > IP 정책", flush=True)
MENU = "거버넌스>IP정책"
page_render(MENU, "/p/gov_ip_policy")
r = get("/api/network/ip-policies")
check_list(r, MENU, "/api/network/ip-policies")
r = post("/api/network/ip-policies", {
    "policy_name": "QA IP 정책", "network": "10.0.0.0/24",
    "description": "QA 테스트",
})
ip_id = check_create(r, MENU, "/api/network/ip-policies")
if ip_id:
    r = put(f"/api/network/ip-policies/{ip_id}", {"policy_name": "QA IP 정책 수정"})
    check_update(r, MENU, f"ip-policy/{ip_id}")
    r = post_bulk_delete("/api/network/ip-policies/bulk-delete", [ip_id])
    check_delete(r, MENU, "ip-policy bulk-delete")


# ══════════════════════════════════════════════
#  12. 거버넌스 > VPN 정책
# ══════════════════════════════════════════════
print("[QA] 12. 거버넌스 > VPN 정책", flush=True)
MENU = "거버넌스>VPN정책"
page_render(MENU, "/p/gov_vpn_policy")
r = get("/api/governance/vpn-lines")
check_list(r, MENU, "/api/governance/vpn-lines")
r = post("/api/governance/vpn-lines", {
    "line_name": "QA VPN 라인", "vpn_type": "SSL", "bandwidth_mbps": 100,
    "description": "QA 테스트",
})
vpn_id = check_create(r, MENU, "/api/governance/vpn-lines")
if vpn_id:
    r = put(f"/api/governance/vpn-lines/{vpn_id}", {"line_name": "QA VPN 라인 수정"})
    check_update(r, MENU, f"vpn-line/{vpn_id}")
    r = post_bulk_delete("/api/governance/vpn-lines/bulk-delete", [vpn_id])
    check_delete(r, MENU, "vpn-line bulk-delete")


# ══════════════════════════════════════════════
#  13. 거버넌스 > 불용자산 관리
# ══════════════════════════════════════════════
print("[QA] 13. 거버넌스 > 불용자산 관리", flush=True)
MENU = "거버넌스>불용자산"
page_render(MENU, "/p/gov_unused_server")
r = get("/api/gov-unused/assets")
check_list(r, MENU, "/api/gov-unused/assets")


# ══════════════════════════════════════════════
#  14. 데이터센터 > 출입 관리
# ══════════════════════════════════════════════
print("[QA] 14. 데이터센터 > 출입 관리", flush=True)
MENU = "데이터센터>출입관리"
page_render(MENU, "/p/dc_access_control")
r = get("/api/datacenter/access/permissions")
check_list(r, MENU, "/api/datacenter/access/permissions")
r = post("/api/datacenter/access/permissions", {
    "person_name": "QA 테스터", "person_type": "직원", "access_zone": "서버실",
    "permission_level": "일반", "valid_from": "2026-01-01", "valid_until": "2026-12-31",
})
access_id = check_create(r, MENU, "/api/datacenter/access/permissions")
if access_id:
    r = put(f"/api/datacenter/access/permissions/{access_id}", {"person_name": "QA 테스터 수정"})
    check_update(r, MENU, f"access/{access_id}")
    r = post_bulk_delete("/api/datacenter/access/permissions/bulk-delete", [access_id])
    check_delete(r, MENU, "access bulk-delete")


# ══════════════════════════════════════════════
#  15. 데이터센터 > 데이터 삭제 관리
# ══════════════════════════════════════════════
print("[QA] 15. 데이터센터 > 데이터 삭제 관리", flush=True)
MENU = "데이터센터>데이터삭제관리"
page_render(MENU, "/p/dc_data_deletion")
r = get("/api/datacenter/data-deletion/records")
check_list(r, MENU, "/api/datacenter/data-deletion/records")
r = post("/api/datacenter/data-deletion/records", {
    "asset_name": "QA 폐기 서버", "deletion_method": "DOD 7회", "requester": "QA 담당자",
    "deletion_date": "2026-01-15", "status": "완료",
})
del_id = check_create(r, MENU, "/api/datacenter/data-deletion/records")
if del_id:
    r = put(f"/api/datacenter/data-deletion/records/{del_id}", {"status": "확인완료"})
    check_update(r, MENU, f"del/{del_id}")
    r = post_bulk_delete("/api/datacenter/data-deletion/records/bulk-delete", [del_id])
    check_delete(r, MENU, "del bulk-delete")


# ══════════════════════════════════════════════
#  16. 데이터센터 > RACK 관리
# ══════════════════════════════════════════════
print("[QA] 16. 데이터센터 > RACK 관리", flush=True)
MENU = "데이터센터>RACK관리"
page_render(MENU, "/p/dc_rack_lab1")
r = get("/api/datacenter/rack/list")
check_list(r, MENU, "/api/datacenter/rack/list")


# ══════════════════════════════════════════════
#  17. 비용관리 > OPEX
# ══════════════════════════════════════════════
print("[QA] 17. 비용관리 > OPEX", flush=True)
MENU = "비용관리>OPEX"
page_render(MENU, "/p/cost_opex_dashboard")
r = get("/api/opex-dashboard")
if r.status_code == 200:
    _ok(MENU, "/api/opex-dashboard", "대시보드조회")
else:
    _fail(MENU, "/api/opex-dashboard", "대시보드조회", f"HTTP {r.status_code}")

r = get("/api/cost/opex/items")
check_list(r, MENU, "/api/cost/opex/items")


# ══════════════════════════════════════════════
#  18. 비용관리 > CAPEX
# ══════════════════════════════════════════════
print("[QA] 18. 비용관리 > CAPEX", flush=True)
MENU = "비용관리>CAPEX"
page_render(MENU, "/p/cost_capex_dashboard")
r = get("/api/capex-dashboard")
if r.status_code == 200:
    _ok(MENU, "/api/capex-dashboard", "대시보드조회")
else:
    _fail(MENU, "/api/capex-dashboard", "대시보드조회", f"HTTP {r.status_code}")

r = get("/api/cost/capex/contracts")
check_list(r, MENU, "/api/cost/capex/contracts")
r = post("/api/cost/capex/contracts", {
    "contract_name": "QA 계약", "vendor": "QA 벤더",
    "contract_amount": 10000000, "start_date": "2026-01-01", "end_date": "2026-12-31",
    "status": "진행중",
})
contract_id = check_create(r, MENU, "/api/cost/capex/contracts")
if contract_id:
    r = put(f"/api/cost/capex/contracts/{contract_id}", {"contract_name": "QA 계약 수정"})
    check_update(r, MENU, f"contract/{contract_id}")
    r = post_bulk_delete("/api/cost/capex/contracts/bulk-delete", [contract_id])
    check_delete(r, MENU, "contract bulk-delete")


# ══════════════════════════════════════════════
#  19. 프로젝트 > 프로젝트 현황
# ══════════════════════════════════════════════
print("[QA] 19. 프로젝트 > 프로젝트 현황", flush=True)
MENU = "프로젝트>프로젝트현황"
page_render(MENU, "/p/proj_status")
r = get("/api/prj/projects")
d = check_list(r, MENU, "/api/prj/projects")

r = post("/api/prj/projects", {
    "project_name": "QA 테스트 프로젝트", "project_code": "QA-PRJ-001",
    "status": "진행중", "start_date": "2026-01-01", "end_date": "2026-12-31",
    "budget": 50000000, "description": "QA 자동 테스트 프로젝트",
})
prj_id = check_create(r, MENU, "/api/prj/projects")
if prj_id:
    r = put(f"/api/prj/projects/{prj_id}", {"project_name": "QA 테스트 프로젝트 수정"})
    check_update(r, MENU, f"project/{prj_id}")

    # 상세조회
    r = get(f"/api/prj/projects/{prj_id}")
    if r.status_code == 200 and r.get_json():
        _ok(MENU, f"/api/prj/projects/{prj_id}", "상세조회")
    else:
        _fail(MENU, f"/api/prj/projects/{prj_id}", "상세조회", f"HTTP {r.status_code}")

    # 멤버
    r = get(f"/api/prj/projects/{prj_id}/members")
    if r.status_code == 200:
        _ok(MENU, f"/api/prj/projects/{prj_id}/members", "멤버조회")
    else:
        _fail(MENU, f"/api/prj/projects/{prj_id}/members", "멤버조회", f"HTTP {r.status_code}")

    # 삭제
    r = post_bulk_delete("/api/prj/projects/bulk-delete", [prj_id])
    check_delete(r, MENU, "project bulk-delete")


# ══════════════════════════════════════════════
#  20. 프로젝트 > 작업 현황 (WRK reports)
# ══════════════════════════════════════════════
print("[QA] 20. 프로젝트 > 작업 현황", flush=True)
MENU = "프로젝트>작업현황"
page_render(MENU, "/p/task_status")
r = get("/api/wrk/reports")
d = check_list(r, MENU, "/api/wrk/reports")

r = post("/api/wrk/reports", {
    "title": "QA 작업 보고서", "work_type": "일반", "status": "작성중",
    "target_system": "QA 시스템", "description": "QA 자동테스트 작업",
    "planned_start": "2026-04-18T09:00:00", "planned_end": "2026-04-18T18:00:00",
})
wrk_id = check_create(r, MENU, "/api/wrk/reports")
if wrk_id:
    r = put(f"/api/wrk/reports/{wrk_id}", {"title": "QA 작업 보고서 수정"})
    check_update(r, MENU, f"wrk/{wrk_id}")
    r = get(f"/api/wrk/reports/{wrk_id}")
    if r.status_code == 200:
        _ok(MENU, f"/api/wrk/reports/{wrk_id}", "상세조회")
    else:
        _fail(MENU, f"/api/wrk/reports/{wrk_id}", "상세조회", f"HTTP {r.status_code}")
    r = delete(f"/api/wrk/reports/{wrk_id}")
    check_delete(r, MENU, f"wrk DELETE {wrk_id}")


# ══════════════════════════════════════════════
#  21. 프로젝트 > 티켓 현황
# ══════════════════════════════════════════════
print("[QA] 21. 프로젝트 > 티켓 현황", flush=True)
MENU = "프로젝트>티켓현황"
page_render(MENU, "/p/workflow_progress")
r = get("/api/workflow/tickets")
check_list(r, MENU, "/api/workflow/tickets")


# ══════════════════════════════════════════════
#  22. 프로젝트 > 워크플로우 제작
# ══════════════════════════════════════════════
print("[QA] 22. 프로젝트 > 워크플로우", flush=True)
MENU = "프로젝트>워크플로우"
page_render(MENU, "/p/wf_designer_explore")
r = get("/api/workflow/templates")
check_list(r, MENU, "/api/workflow/templates")
r = post("/api/workflow/templates", {
    "template_name": "QA 워크플로우", "description": "QA 테스트",
    "steps": [],
})
wf_id = check_create(r, MENU, "/api/workflow/templates")
if wf_id:
    r = put(f"/api/workflow/templates/{wf_id}", {"template_name": "QA 워크플로우 수정"})
    check_update(r, MENU, f"wf/{wf_id}")
    r = delete(f"/api/workflow/templates/{wf_id}")
    check_delete(r, MENU, f"wf DELETE {wf_id}")


# ══════════════════════════════════════════════
#  23. 인사이트 > 기술자료
# ══════════════════════════════════════════════
print("[QA] 23. 인사이트 > 기술자료", flush=True)
MENU = "인사이트>기술자료"
page_render(MENU, "/p/insight_trend")
page_render(MENU, "/p/insight_security")
page_render(MENU, "/p/insight_report")
r = get("/api/insight/info-items")
check_list(r, MENU, "/api/insight/info-items")
r = post("/api/insight/info-items", {
    "title": "QA 기술자료", "category": "트렌드", "content": "QA 테스트 내용",
    "author": "QA Admin", "tags": "QA,테스트",
})
info_id = check_create(r, MENU, "/api/insight/info-items")
if info_id:
    r = put(f"/api/insight/info-items/{info_id}", {"title": "QA 기술자료 수정"})
    check_update(r, MENU, f"info/{info_id}")
    r = post_bulk_delete("/api/insight/info-items/bulk-delete", [info_id])
    check_delete(r, MENU, "info bulk-delete")


# ══════════════════════════════════════════════
#  24. 인사이트 > 블로그
# ══════════════════════════════════════════════
print("[QA] 24. 인사이트 > 블로그", flush=True)
MENU = "인사이트>블로그"
page_render(MENU, "/p/insight_blog_it")
r = get("/api/insight/blog/posts")
check_list(r, MENU, "/api/insight/blog/posts")
r = post("/api/insight/blog/posts", {
    "title": "QA 블로그 포스트", "content": "QA 테스트 내용",
    "category": "IT", "tags": "QA,테스트",
})
blog_id = check_create(r, MENU, "/api/insight/blog/posts")
if blog_id:
    r = put(f"/api/insight/blog/posts/{blog_id}", {"title": "QA 블로그 수정"})
    check_update(r, MENU, f"blog/{blog_id}")
    r = post_bulk_delete("/api/insight/blog/posts/bulk-delete", [blog_id])
    check_delete(r, MENU, "blog bulk-delete")


# ══════════════════════════════════════════════
#  25. 카테고리 > 비즈니스
# ══════════════════════════════════════════════
print("[QA] 25. 카테고리 > 비즈니스", flush=True)
MENU = "카테고리>비즈니스"
page_render(MENU, "/p/cat_business_dashboard")
r = get("/api/category/business/divisions")
check_list(r, MENU, "/api/category/business/divisions")
r = post("/api/category/business/divisions", {
    "division_name": "QA 사업부", "division_code": "QA-DIV",
    "description": "QA 테스트",
})
div_id = check_create(r, MENU, "/api/category/business/divisions")
if div_id:
    r = put(f"/api/category/business/divisions/{div_id}", {"division_name": "QA 사업부 수정"})
    check_update(r, MENU, f"division/{div_id}")
    r = post_bulk_delete("/api/category/business/divisions/bulk-delete", [div_id])
    check_delete(r, MENU, "division bulk-delete")


# ══════════════════════════════════════════════
#  26. 카테고리 > 하드웨어
# ══════════════════════════════════════════════
print("[QA] 26. 카테고리 > 하드웨어", flush=True)
MENU = "카테고리>하드웨어"
page_render(MENU, "/p/cat_hw_dashboard")
r = get("/api/category/hw/network-types")
check_list(r, MENU, "/api/category/hw/network-types")
r = post("/api/category/hw/network-types", {
    "type_name": "QA 네트워크 유형", "type_code": "QA-NET",
    "description": "QA 테스트",
})
nwtype_id = check_create(r, MENU, "/api/category/hw/network-types")
if nwtype_id:
    r = put(f"/api/category/hw/network-types/{nwtype_id}", {"type_name": "QA 네트워크 유형 수정"})
    check_update(r, MENU, f"nw-type/{nwtype_id}")
    r = post_bulk_delete("/api/category/hw/network-types/bulk-delete", [nwtype_id])
    check_delete(r, MENU, "nw-type bulk-delete")


# ══════════════════════════════════════════════
#  27. 카테고리 > 소프트웨어
# ══════════════════════════════════════════════
print("[QA] 27. 카테고리 > 소프트웨어", flush=True)
MENU = "카테고리>소프트웨어"
page_render(MENU, "/p/cat_sw_dashboard")
r = get("/api/category/sw/os-types")
check_list(r, MENU, "/api/category/sw/os-types")
r = post("/api/category/sw/os-types", {
    "type_name": "QA OS", "type_code": "QA-OS", "description": "QA 테스트",
})
ostype_id = check_create(r, MENU, "/api/category/sw/os-types")
if ostype_id:
    r = put(f"/api/category/sw/os-types/{ostype_id}", {"type_name": "QA OS 수정"})
    check_update(r, MENU, f"os-type/{ostype_id}")
    r = post_bulk_delete("/api/category/sw/os-types/bulk-delete", [ostype_id])
    check_delete(r, MENU, "os-type bulk-delete")


# ══════════════════════════════════════════════
#  28. 카테고리 > 컴포넌트
# ══════════════════════════════════════════════
print("[QA] 28. 카테고리 > 컴포넌트", flush=True)
MENU = "카테고리>컴포넌트"
page_render(MENU, "/p/cat_component_cpu")
r = get("/api/category/components/cpu-types")
check_list(r, MENU, "/api/category/components/cpu-types")
r = post("/api/category/components/cpu-types", {
    "type_name": "QA CPU", "type_code": "QA-CPU",
    "vendor": "Intel", "description": "QA 테스트",
})
cpu_id = check_create(r, MENU, "/api/category/components/cpu-types")
if cpu_id:
    r = put(f"/api/category/components/cpu-types/{cpu_id}", {"type_name": "QA CPU 수정"})
    check_update(r, MENU, f"cpu/{cpu_id}")
    r = post_bulk_delete("/api/category/components/cpu-types/bulk-delete", [cpu_id])
    check_delete(r, MENU, "cpu bulk-delete")


# ══════════════════════════════════════════════
#  29. 카테고리 > 회사
# ══════════════════════════════════════════════
print("[QA] 29. 카테고리 > 회사", flush=True)
MENU = "카테고리>회사"
page_render(MENU, "/p/cat_company_center")
r = get("/api/org/centers")
check_list(r, MENU, "/api/org/centers")
r = post("/api/org/centers", {
    "center_name": "QA 본사", "center_code": "QA-HQ",
    "address": "서울 강남구", "description": "QA 테스트",
})
center_id = check_create(r, MENU, "/api/org/centers")
if center_id:
    r = put(f"/api/org/centers/{center_id}", {"center_name": "QA 본사 수정"})
    check_update(r, MENU, f"center/{center_id}")
    r = post_bulk_delete("/api/org/centers/bulk-delete", [center_id])
    check_delete(r, MENU, "center bulk-delete")


# ══════════════════════════════════════════════
#  30. 카테고리 > 고객
# ══════════════════════════════════════════════
print("[QA] 30. 카테고리 > 고객", flush=True)
MENU = "카테고리>고객"
page_render(MENU, "/p/cat_customer_client1")
r = get("/api/category/customers")
check_list(r, MENU, "/api/category/customers")
r = post("/api/category/customers", {
    "customer_name": "QA 고객사", "customer_code": "QA-CUST",
    "contact": "담당자", "description": "QA 테스트",
})
cust_id = check_create(r, MENU, "/api/category/customers")
if cust_id:
    r = put(f"/api/category/customers/{cust_id}", {"customer_name": "QA 고객사 수정"})
    check_update(r, MENU, f"customer/{cust_id}")
    r = post_bulk_delete("/api/category/customers/bulk-delete", [cust_id])
    check_delete(r, MENU, "customer bulk-delete")


# ══════════════════════════════════════════════
#  31. 카테고리 > 벤더 (제조사)
# ══════════════════════════════════════════════
print("[QA] 31. 카테고리 > 벤더 (제조사)", flush=True)
MENU = "카테고리>벤더(제조사)"
page_render(MENU, "/p/cat_vendor_manufacturer")
r = get("/api/vendor-manufacturers")
check_list(r, MENU, "/api/vendor-manufacturers")
r = post("/api/vendor-manufacturers", {
    "manufacturer_name": "QA 제조사", "manufacturer_code": "QA-MFR",
    "country": "대한민국", "description": "QA 테스트",
})
mfr_id = check_create(r, MENU, "/api/vendor-manufacturers")
if mfr_id:
    r = put(f"/api/vendor-manufacturers/{mfr_id}", {"manufacturer_name": "QA 제조사 수정"})
    check_update(r, MENU, f"mfr/{mfr_id}")
    r = post_bulk_delete("/api/vendor-manufacturers/bulk-delete", [mfr_id])
    check_delete(r, MENU, "mfr bulk-delete")


# ══════════════════════════════════════════════
#  32. 카테고리 > 벤더 (유지보수)
# ══════════════════════════════════════════════
print("[QA] 32. 카테고리 > 벤더 (유지보수)", flush=True)
MENU = "카테고리>벤더(유지보수)"
r = get("/api/vendor-maintenance")
check_list(r, MENU, "/api/vendor-maintenance")
r = post("/api/vendor-maintenance", {
    "vendor_name": "QA 유지보수사", "vendor_code": "QA-VND",
    "contact": "담당자", "description": "QA 테스트",
})
vnd_id = check_create(r, MENU, "/api/vendor-maintenance")
if vnd_id:
    r = put(f"/api/vendor-maintenance/{vnd_id}", {"vendor_name": "QA 유지보수사 수정"})
    check_update(r, MENU, f"vnd/{vnd_id}")
    r = post_bulk_delete("/api/vendor-maintenance/bulk-delete", [vnd_id])
    check_delete(r, MENU, "vnd bulk-delete")


# ══════════════════════════════════════════════
#  33. 설정 (Settings) - 세션/권한
# ══════════════════════════════════════════════
print("[QA] 33. 설정 > 권한/세션", flush=True)
MENU = "설정>권한/세션"
r = get("/api/session/me")
if r.status_code == 200:
    _ok(MENU, "/api/session/me", "세션조회")
else:
    _fail(MENU, "/api/session/me", "세션조회", f"HTTP {r.status_code}")

r = get("/api/session/permissions")
if r.status_code == 200:
    _ok(MENU, "/api/session/permissions", "권한조회")
else:
    _fail(MENU, "/api/session/permissions", "권한조회", f"HTTP {r.status_code}")

r = get("/api/menus")
if r.status_code == 200:
    _ok(MENU, "/api/menus", "메뉴조회")
else:
    _fail(MENU, "/api/menus", "메뉴조회", f"HTTP {r.status_code}")

r = get("/api/users")
if r.status_code == 200:
    _ok(MENU, "/api/users", "사용자목록")
else:
    _fail(MENU, "/api/users", "사용자목록", f"HTTP {r.status_code}")


# ══════════════════════════════════════════════
#  34. 인증 없는 접근 차단 확인
# ══════════════════════════════════════════════
print("[QA] 34. 비인증 접근 차단 확인", flush=True)
MENU = "보안>비인증차단"
anon = flask_app.test_client()  # 세션 없음

# 보호된 API에 비인증 접근
for protected_url in [
    "/api/hardware/onpremise/assets",
    "/api/prj/projects",
    "/api/wrk/reports",
    "/api/governance/vulnerability-guides",
]:
    r = anon.get(protected_url)
    if r.status_code in (401, 403):
        _ok(MENU, protected_url, "비인증차단", f"HTTP {r.status_code} (정상 차단)")
    elif r.status_code == 200:
        d = r.get_json()
        if d and d.get("success") is False:
            _ok(MENU, protected_url, "비인증차단", f"success=false (응답에서 차단)")
        else:
            _fail(MENU, protected_url, "비인증차단", f"HTTP 200 반환 → 비인증 접근 허용됨!")
    else:
        _warn(MENU, protected_url, "비인증차단", f"HTTP {r.status_code}")


# ══════════════════════════════════════════════
#  35. 페이지 라우트 일괄 확인
# ══════════════════════════════════════════════
print("[QA] 35. 주요 페이지 라우트 렌더링 확인", flush=True)
PAGES_TO_CHECK = [
    ("대시보드", "/p/dashboard"),
    ("서버온프레미스", "/p/hw_server_onpremise"),
    ("서버클라우드", "/p/hw_server_cloud"),
    ("서버프레임", "/p/hw_server_frame"),
    ("워크스테이션", "/p/hw_server_workstation"),
    ("스토리지SAN", "/p/hw_storage_san"),
    ("스토리지백업", "/p/hw_storage_backup"),
    ("SAN Director", "/p/hw_san_director"),
    ("SAN Switch", "/p/hw_san_switch"),
    ("네트워크L2", "/p/hw_network_l2"),
    ("네트워크L4", "/p/hw_network_l4"),
    ("네트워크L7", "/p/hw_network_l7"),
    ("네트워크AP", "/p/hw_network_ap"),
    ("네트워크전용회선", "/p/hw_network_dedicateline"),
    ("방화벽", "/p/hw_security_firewall"),
    ("VPN장비", "/p/hw_security_vpn"),
    ("IDS", "/p/hw_security_ids"),
    ("IPS", "/p/hw_security_ips"),
    ("HSM", "/p/hw_security_hsm"),
    ("KMS", "/p/hw_security_kms"),
    ("WIPS", "/p/hw_security_wips"),
    ("백업대시보드", "/p/gov_backup_dashboard"),
    ("백업정책", "/p/gov_backup_policy"),
    ("백업테이프", "/p/gov_backup_tape"),
    ("패키지대시보드", "/p/gov_package_dashboard"),
    ("패키지목록", "/p/gov_package_list"),
    ("취약점대시보드", "/p/gov_vulnerability_dashboard"),
    ("취약점분석", "/p/gov_vulnerability_analysis"),
    ("취약점가이드", "/p/gov_vulnerability_guide"),
    ("IP정책", "/p/gov_ip_policy"),
    ("DNS정책", "/p/gov_dns_policy"),
    ("AD정책", "/p/gov_ad_policy"),
    ("VPN정책", "/p/gov_vpn_policy"),
    ("전용회선정책", "/p/gov_dedicatedline_member"),
    ("불용서버", "/p/gov_unused_server"),
    ("출입관리", "/p/dc_access_control"),
    ("데이터삭제", "/p/dc_data_deletion"),
    ("RACK Lab1", "/p/dc_rack_lab1"),
    ("온습도", "/p/dc_thermo_lab1"),
    ("CCTV", "/p/dc_cctv_lab1"),
    ("OPEX대시보드", "/p/cost_opex_dashboard"),
    ("CAPEX대시보드", "/p/cost_capex_dashboard"),
    ("프로젝트현황", "/p/proj_status"),
    ("작업현황", "/p/task_status"),
    ("티켓현황", "/p/workflow_progress"),
    ("워크플로우", "/p/wf_designer_explore"),
    ("기술트렌드", "/p/insight_trend"),
    ("블로그", "/p/insight_blog_it"),
    ("비즈니스카테고리", "/p/cat_business_dashboard"),
    ("하드웨어카테고리", "/p/cat_hw_dashboard"),
    ("소프트웨어카테고리", "/p/cat_sw_dashboard"),
    ("CPU컴포넌트", "/p/cat_component_cpu"),
    ("회사", "/p/cat_company_center"),
    ("고객", "/p/cat_customer_client1"),
    ("벤더제조사", "/p/cat_vendor_manufacturer"),
]
for label, url in PAGES_TO_CHECK:
    page_render(f"페이지>{label}", url)


# ══════════════════════════════════════════════
#  결과 출력
# ══════════════════════════════════════════════
print("\n", flush=True)
print("=" * 80)
print("  BLOSSOM QA 전수 점검 결과")
print("=" * 80)

ok_cnt = sum(1 for r in results if r["status"] == "OK")
fail_cnt = sum(1 for r in results if r["status"] == "FAIL")
warn_cnt = sum(1 for r in results if r["status"] == "WARN")
total = len(results)

print(f"\n총 {total}개 항목 점검완료 | OK: {ok_cnt} | FAIL: {fail_cnt} | WARN: {warn_cnt}\n")

# FAIL 항목 먼저
if fail_cnt:
    print("─" * 80)
    print("  [FAIL] 이슈 목록")
    print("─" * 80)
    for r in results:
        if r["status"] == "FAIL":
            print(f"  ✗ [{r['menu']}] {r['action']} | {r['api']}")
            if r["note"]:
                print(f"      └─ {r['note']}")

# WARN 항목
if warn_cnt:
    print("\n" + "─" * 80)
    print("  [WARN] 경고 목록")
    print("─" * 80)
    for r in results:
        if r["status"] == "WARN":
            print(f"  △ [{r['menu']}] {r['action']} | {r['api']}")
            if r["note"]:
                print(f"      └─ {r['note']}")

# OK 항목 요약
print("\n" + "─" * 80)
print("  [OK] 정상 항목 (요약)")
print("─" * 80)
for r in results:
    if r["status"] == "OK":
        note = f" ({r['note']})" if r["note"] else ""
        print(f"  ✓ [{r['menu']}] {r['action']}{note}")

# JSON 저장
import json as _json_mod
out_file = BASE / "_qa_crud_results.json"
with open(out_file, "w", encoding="utf-8") as f:
    _json_mod.dump({
        "generated_at": datetime.now().isoformat(),
        "summary": {"total": total, "ok": ok_cnt, "fail": fail_cnt, "warn": warn_cnt},
        "results": results,
    }, f, ensure_ascii=False, indent=2)
print(f"\n[QA] 상세 결과 저장: {out_file}")

# 종료 후 임시 파일 정리
shutil.rmtree(TMP_DIR, ignore_errors=True)

if fail_cnt > 0:
    sys.exit(1)
