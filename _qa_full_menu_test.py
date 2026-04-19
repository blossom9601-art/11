#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QA 전수 점검: 사이드바 메뉴별 페이지 진입 + CRUD API 테스트
Flask test_client 기반, 실제 DB(test용) 연동
"""
import json
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# ── 프로젝트 root ──────────────────────────────────────
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app import create_app
from app.models import db, UserProfile

SCHEMA_PATH = ROOT / "scripts" / "sql" / "hardware_asset_schema.sql"
RESULTS = defaultdict(lambda: {"page": None, "spa": None, "api": {}, "issues": []})

# ═══════════════════════════════════════════════════════
# 1) 사이드바 메뉴 전체 목록 (페이지 키 → 라벨)
# ═══════════════════════════════════════════════════════
SIDEBAR_MENUS = {
    "dashboard": "대시보드",
    "hw_server_onpremise": "서버(온프레미스)",
    "hw_server_cloud": "서버(클라우드)",
    "hw_server_frame": "서버(프레임)",
    "hw_server_workstation": "서버(워크스테이션)",
    "hw_storage_san": "스토리지(SAN)",
    "hw_storage_backup": "스토리지(백업)",
    "hw_san_director": "SAN(디렉터)",
    "hw_san_switch": "SAN(스위치)",
    "hw_network_l2": "네트워크(L2)",
    "hw_network_l4": "네트워크(L4)",
    "hw_network_l7": "네트워크(L7)",
    "hw_network_ap": "네트워크(AP)",
    "hw_network_dedicateline": "네트워크(전용회선)",
    "hw_security_firewall": "보안장비(방화벽)",
    "hw_security_vpn": "보안장비(VPN)",
    "hw_security_ids": "보안장비(IDS)",
    "hw_security_ips": "보안장비(IPS)",
    "hw_security_hsm": "보안장비(HSM)",
    "hw_security_kms": "보안장비(KMS)",
    "hw_security_wips": "보안장비(WIPS)",
    "hw_security_etc": "보안장비(기타)",
    "gov_backup_dashboard": "백업 정책(대시보드)",
    "gov_backup_policy": "백업 정책(정책목록)",
    "gov_backup_tape": "백업 정책(테이프)",
    "gov_package_dashboard": "패키지 관리(대시보드)",
    "gov_package_list": "패키지 관리(목록)",
    "gov_vulnerability_dashboard": "취약점 분석(대시보드)",
    "gov_vulnerability_analysis": "취약점 분석(분석목록)",
    "gov_vulnerability_guide": "취약점 분석(대응가이드)",
    "gov_ip_policy": "IP 정책",
    "gov_vpn_policy": "VPN 정책",
    "gov_dedicatedline_member": "전용회선 정책",
    "gov_unused_server": "불용자산 관리",
    "dc_access_control": "출입 관리",
    "dc_data_deletion": "데이터 삭제 관리",
    "dc_rack_list": "RACK 관리",
    "dc_thermometer_list": "온/습도 관리",
    "dc_cctv_list": "CCTV 관리",
    "cost_opex_dashboard": "OPEX(대시보드)",
    "cost_capex_dashboard": "CAPEX(대시보드)",
    "proj_status": "프로젝트 현황",
    "task_status": "작업 현황",
    "workflow_progress": "티켓 현황",
    "wf_designer_explore": "워크플로우 제작",
    "insight_trend": "기술자료",
    "insight_blog_it": "블로그",
    "cat_business_dashboard": "비즈니스(대시보드)",
    "cat_business_work": "비즈니스(업무분류)",
    "cat_business_division": "비즈니스(업무구분)",
    "cat_business_status": "비즈니스(운영상태)",
    "cat_business_operation": "비즈니스(운영등급)",
    "cat_business_group": "비즈니스(업무그룹)",
    "cat_hw_dashboard": "하드웨어(대시보드)",
    "cat_hw_server": "하드웨어(서버)",
    "cat_hw_storage": "하드웨어(스토리지)",
    "cat_hw_san": "하드웨어(SAN)",
    "cat_hw_network": "하드웨어(네트워크)",
    "cat_hw_security": "하드웨어(보안)",
    "cat_sw_dashboard": "소프트웨어(대시보드)",
    "cat_sw_os": "소프트웨어(OS)",
    "cat_sw_database": "소프트웨어(데이터베이스)",
    "cat_sw_middleware": "소프트웨어(미들웨어)",
    "cat_sw_virtualization": "소프트웨어(가상화)",
    "cat_sw_security": "소프트웨어(보안)",
    "cat_sw_high_availability": "소프트웨어(고가용성)",
    "cat_component_cpu": "컴포넌트(CPU)",
    "cat_component_gpu": "컴포넌트(GPU)",
    "cat_component_memory": "컴포넌트(메모리)",
    "cat_component_disk": "컴포넌트(디스크)",
    "cat_component_nic": "컴포넌트(NIC)",
    "cat_component_hba": "컴포넌트(HBA)",
    "cat_component_etc": "컴포넌트(기타)",
    "cat_company_company": "회사",
    "cat_company_center": "센터",
    "cat_company_department": "부서",
    "cat_customer_client1": "고객(사)",
    "cat_vendor_manufacturer": "벤더(제조사)",
    "cat_vendor_maintenance": "벤더(유지보수)",
}

# ═══════════════════════════════════════════════════════
# 2) 메뉴별 CRUD API 매핑
# ═══════════════════════════════════════════════════════
API_CRUD_MAP = {
    "gov_backup_policy": {
        "list": "/api/governance/backup-policies",
        "create": "/api/governance/backup-policies",
        "delete": "/api/governance/backup-policies/bulk-delete",
    },
    "gov_backup_tape": {"list": "/api/governance/backup-tapes"},
    "gov_vulnerability_guide": {
        "list": "/api/governance/vulnerability-guides",
        "create": "/api/governance/vulnerability-guides",
    },
    "gov_vulnerability_analysis": {"list": "/api/governance/vulnerability-analysis"},
    "hw_server_onpremise": {
        "list": "/api/hardware/assets?scope=server&sub_scope=onpremise",
        "create": "/api/hardware/assets",
        "delete": "/api/hardware/assets/bulk-delete",
    },
    "hw_server_cloud": {"list": "/api/hardware/assets?scope=server&sub_scope=cloud"},
    "hw_storage_san": {"list": "/api/hardware/assets?scope=storage&sub_scope=san"},
    "hw_network_l2": {"list": "/api/hardware/assets?scope=network&sub_scope=l2"},
    "hw_security_firewall": {"list": "/api/hardware/assets?scope=security&sub_scope=firewall"},
    "dc_access_control": {
        "list": "/api/datacenter/access/permissions",
        "create": "/api/datacenter/access/permissions",
    },
    "dc_data_deletion": {"list": "/api/datacenter/data-deletion"},
    "dc_rack_list": {"list": "/api/datacenter/racks"},
    "dc_thermometer_list": {"list": "/api/datacenter/thermometers"},
    "dc_cctv_list": {"list": "/api/datacenter/cctvs"},
    "cost_opex_dashboard": {"list": "/api/cost/opex/dashboard"},
    "cost_capex_dashboard": {"list": "/api/cost/capex/dashboard"},
    "proj_status": {
        "list": "/api/prj/projects",
        "create": "/api/prj/projects",
    },
    "task_status": {"list": "/api/wrk/tasks"},
    "workflow_progress": {"list": "/api/tickets"},
    "insight_trend": {"list": "/api/insight/items?category=trend"},
    "insight_blog_it": {"list": "/api/insight/blog/posts"},
    "cat_business_work": {
        "list": "/api/category/work-classifications",
        "create": "/api/category/work-classifications",
        "delete": "/api/category/work-classifications/bulk-delete",
    },
    "cat_business_division": {
        "list": "/api/category/work-divisions",
        "create": "/api/category/work-divisions",
        "delete": "/api/category/work-divisions/bulk-delete",
    },
    "cat_business_status": {
        "list": "/api/category/work-statuses",
        "create": "/api/category/work-statuses",
    },
    "cat_business_operation": {
        "list": "/api/category/operation-levels",
        "create": "/api/category/operation-levels",
    },
    "cat_business_group": {
        "list": "/api/category/work-groups",
        "create": "/api/category/work-groups",
    },
    "cat_hw_server": {
        "list": "/api/category/hw-types?scope=server",
        "create": "/api/category/hw-types",
    },
    "cat_sw_os": {
        "list": "/api/category/sw-types?scope=os",
        "create": "/api/category/sw-types",
    },
    "cat_component_cpu": {
        "list": "/api/category/component-types?scope=cpu",
        "create": "/api/category/component-types",
    },
    "cat_company_company": {
        "list": "/api/category/companies",
        "create": "/api/category/companies",
    },
    "cat_company_center": {
        "list": "/api/category/centers",
        "create": "/api/category/centers",
    },
    "cat_company_department": {
        "list": "/api/category/departments",
        "create": "/api/category/departments",
    },
    "cat_customer_client1": {
        "list": "/api/category/customers",
        "create": "/api/category/customers",
    },
    "cat_vendor_manufacturer": {
        "list": "/api/vendor-manufacturers",
        "create": "/api/vendor-manufacturers",
        "delete": "/api/vendor-manufacturers/bulk-delete",
    },
    "cat_vendor_maintenance": {
        "list": "/api/vendor-maintenances",
        "create": "/api/vendor-maintenances",
    },
}

CREATE_PAYLOADS = {
    "gov_backup_policy": {"policy_name": "QA_TEST_POLICY", "description": "auto test"},
    "gov_vulnerability_guide": {"title": "QA_VULN_GUIDE", "content": "test"},
    "hw_server_onpremise": {"hostname": "qa-svr-001", "scope": "server", "sub_scope": "onpremise"},
    "dc_access_control": {"user_name": "QA_USER", "department": "QA"},
    "proj_status": {"project_name": "QA_PRJ", "description": "auto test"},
    "cat_business_work": {"classification_code": "QA01", "classification_name": "QA_WORK"},
    "cat_business_division": {"division_code": "QD01", "division_name": "QA_DIV"},
    "cat_business_status": {"status_code": "QS01", "status_name": "QA_ST", "status_level": "info"},
    "cat_business_operation": {"level_code": "QO01", "level_name": "QA_OP"},
    "cat_business_group": {"group_code": "QG01", "group_name": "QA_GRP"},
    "cat_hw_server": {"type_code": "QH01", "type_name": "QA_HW", "scope": "server"},
    "cat_sw_os": {"type_code": "QSW1", "type_name": "QA_OS", "scope": "os"},
    "cat_component_cpu": {"type_code": "QC01", "type_name": "QA_CPU", "scope": "cpu"},
    "cat_company_company": {"company_name": "QA_COMPANY"},
    "cat_company_center": {"center_name": "QA_CENTER"},
    "cat_company_department": {"department_name": "QA_DEPT"},
    "cat_customer_client1": {"client_name": "QA_CLIENT"},
    "cat_vendor_manufacturer": {"manufacturer_name": "QA_MANUFACTURER"},
    "cat_vendor_maintenance": {"maintenance_name": "QA_MAINT"},
}


def _init_shared_db(db_path):
    if not SCHEMA_PATH.exists():
        return
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with sqlite3.connect(db_path) as conn, SCHEMA_PATH.open("r", encoding="utf-8") as f:
        conn.executescript(f.read())
        ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "INSERT OR IGNORE INTO biz_work_status "
            "(status_code,status_name,status_level,created_at,created_by,updated_at,updated_by,is_deleted) "
            "VALUES (?,?,?,?,?,?,?,0)",
            ("ACTIVE", "운영", "success", ts, "test", ts, "test"),
        )
        conn.execute(
            "INSERT OR IGNORE INTO biz_work_group "
            "(group_code,group_name,created_at,created_by,updated_at,updated_by,is_deleted) "
            "VALUES (?,?,?,?,?,?,0)",
            ("OPS", "운영그룹", ts, "test", ts, "test"),
        )
        conn.commit()


def setup_app():
    import tempfile
    tmp = tempfile.mkdtemp(prefix="blossom_qa_")
    shared_sqlite = os.path.join(tmp, "qa_test.sqlite")

    app = create_app('testing')
    os.makedirs(app.instance_path, exist_ok=True)

    try:
        from app.services.software_asset_service import INITIALIZED_DBS
        INITIALIZED_DBS.discard(os.path.abspath(shared_sqlite))
    except Exception:
        pass

    sqlite_configs = {
        'SQLALCHEMY_DATABASE_URI': f"sqlite:///{shared_sqlite.replace(os.sep, '/')}",
    }
    for k in [
        'SW_OS_TYPE', 'SW_DB_TYPE', 'SW_MIDDLEWARE_TYPE', 'SW_VIRTUAL_TYPE',
        'SW_SECURITY_TYPE', 'SW_HA_TYPE', 'CMP_CPU_TYPE', 'CMP_GPU_TYPE',
        'CMP_MEMORY_TYPE', 'CMP_DISK_TYPE', 'CMP_NIC_TYPE', 'CMP_HBA_TYPE',
        'CMP_ETC_TYPE', 'VENDOR_MANUFACTURER', 'ORG_CENTER', 'ORG_RACK',
        'SYSTEM_LAB1_SURFACE', 'SYSTEM_LAB2_SURFACE', 'SYSTEM_LAB3_SURFACE',
        'SYSTEM_LAB4_SURFACE', 'SOFTWARE_ASSET', 'SERVER_SOFTWARE',
        'NETWORK_IP_POLICY', 'NETWORK_DNS_POLICY', 'NETWORK_AD',
        'ACCESS_ENTRY_REGISTER', 'DATA_DELETE_REGISTER', 'DATA_DELETE_SYSTEM',
    ]:
        sqlite_configs[f'{k}_SQLITE_PATH'] = shared_sqlite

    app.config.update(sqlite_configs)

    with app.app_context():
        db.create_all()
        _init_shared_db(shared_sqlite)

        # Init all service tables
        init_fns = []
        init_modules = [
            ('app.services.vendor_manufacturer_service', 'init_vendor_manufacturer_table'),
            ('app.services.sw_os_type_service', 'init_sw_os_type_table'),
            ('app.services.sw_db_type_service', 'init_sw_db_type_table'),
            ('app.services.sw_middleware_type_service', 'init_sw_middleware_type_table'),
            ('app.services.sw_virtual_type_service', 'init_sw_virtual_type_table'),
            ('app.services.sw_security_type_service', 'init_sw_security_type_table'),
            ('app.services.sw_high_availability_type_service', 'init_sw_ha_type_table'),
            ('app.services.cmp_cpu_type_service', 'init_cmp_cpu_type_table'),
            ('app.services.cmp_gpu_type_service', 'init_cmp_gpu_type_table'),
            ('app.services.cmp_memory_type_service', 'init_cmp_memory_type_table'),
            ('app.services.cmp_disk_type_service', 'init_cmp_disk_type_table'),
            ('app.services.cmp_nic_type_service', 'init_cmp_nic_type_table'),
            ('app.services.cmp_hba_type_service', 'init_cmp_hba_type_table'),
            ('app.services.cmp_etc_type_service', 'init_cmp_etc_type_table'),
            ('app.services.org_center_service', 'init_org_center_table'),
            ('app.services.org_rack_service', 'init_org_rack_table'),
            ('app.services.system_lab1_surface_service', 'init_system_lab1_surface_table'),
            ('app.services.system_lab2_surface_service', 'init_system_lab2_surface_table'),
            ('app.services.system_lab3_surface_service', 'init_system_lab3_surface_table'),
            ('app.services.system_lab4_surface_service', 'init_system_lab4_surface_table'),
            ('app.services.software_asset_service', 'init_software_asset_table'),
            ('app.services.server_software_service', 'init_server_software_table'),
            ('app.services.network_ip_policy_service', 'init_network_ip_policy_table'),
            ('app.services.network_dns_policy_service', 'init_network_dns_policy_table'),
            ('app.services.network_dns_policy_log_service', 'init_network_dns_policy_log_table'),
            ('app.services.network_dns_record_service', 'init_network_dns_record_table'),
            ('app.services.network_dns_diagram_service', 'init_network_dns_diagram_table'),
            ('app.services.network_ip_diagram_service', 'init_network_ip_diagram_table'),
            ('app.services.network_ad_service', 'init_network_ad_table'),
            ('app.services.network_ad_service', 'init_network_ad_account_tables'),
            ('app.services.access_entry_register_service', 'init_access_entry_register_table'),
            ('app.services.data_delete_register_service', 'init_data_delete_register_table'),
            ('app.services.data_delete_system_service', 'init_data_delete_system_table'),
        ]
        import importlib
        for mod_path, fn_name in init_modules:
            try:
                mod = importlib.import_module(mod_path)
                fn = getattr(mod, fn_name)
                fn(app)
            except Exception as e:
                print(f"  [WARN] {mod_path}.{fn_name} init failed: {e}")

    return app


def make_authed_client(app):
    with app.app_context():
        user = UserProfile.query.filter_by(emp_no='QA001').first()
        if not user:
            user = UserProfile(emp_no='QA001', name='QA Tester', department='QA', email='qa001@test.com')
            db.session.add(user)
            db.session.commit()
        uid = user.id

    client = app.test_client()
    with client.session_transaction() as sess:
        sess['emp_no'] = 'QA001'
        sess['user_id'] = uid
        sess['user_profile_id'] = uid
        sess['role'] = 'ADMIN'
        sess['_perms'] = {}
    return client


def test_page(client, key):
    """페이지 라우트 진입 테스트 (full + SPA)"""
    url = f"/p/{key}"
    result = {"full": None, "spa": None, "issues": []}
    # Full render
    try:
        resp = client.get(url)
        result["full"] = resp.status_code
    except Exception as e:
        result["full"] = f"EXC:{e}"
        result["issues"].append(("Critical", f"페이지 예외: {e}"))

    # SPA render
    try:
        resp = client.get(url, headers={"X-Requested-With": "blossom-spa"})
        result["spa"] = resp.status_code
        if resp.status_code == 200:
            html = resp.data.decode("utf-8", errors="replace")
            if "\ufffd" in html[:3000]:
                result["issues"].append(("Medium", "인코딩 깨짐 (U+FFFD)"))
    except Exception as e:
        result["spa"] = f"EXC:{e}"
    return result


def test_api(client, key, apis):
    """API CRUD 테스트"""
    result = {"list": None, "create": None, "delete": None, "issues": []}

    # LIST
    if "list" in apis:
        url = apis["list"]
        try:
            resp = client.get(url)
            data = resp.get_json(silent=True)
            if resp.status_code == 200 and data:
                rows = data.get("rows") or data.get("items") or data.get("data") or []
                result["list"] = {
                    "code": 200,
                    "success": data.get("success"),
                    "total": data.get("total", len(rows) if isinstance(rows, list) else "?"),
                    "keys": sorted(data.keys())[:8],
                }
            elif resp.status_code == 200 and data is None:
                result["list"] = {"code": 200, "success": None, "note": "NO_JSON_BODY"}
                result["issues"].append(("High", f"LIST {url}: JSON 응답 없음"))
            else:
                result["list"] = {"code": resp.status_code, "success": False}
                result["issues"].append(("High", f"LIST {url}: HTTP {resp.status_code}"))
        except Exception as e:
            result["list"] = {"code": 0, "error": str(e)}
            result["issues"].append(("Critical", f"LIST {url}: 예외 {e}"))

    # CREATE
    if "create" in apis:
        url = apis["create"]
        payload = CREATE_PAYLOADS.get(key, {"name": "QA_TEST"})
        try:
            resp = client.post(url, json=payload, content_type="application/json")
            data = resp.get_json(silent=True) or {}
            result["create"] = {
                "code": resp.status_code,
                "success": data.get("success"),
                "msg": (data.get("message") or data.get("error") or "")[:80],
                "id": data.get("id") or (data.get("item") or {}).get("id"),
            }
            if resp.status_code >= 500:
                result["issues"].append(("Critical", f"CREATE {url}: 서버 에러 {resp.status_code}"))
            elif data.get("success") is False and resp.status_code not in (400, 409, 422):
                result["issues"].append(("High", f"CREATE {url}: 실패 - {data.get('message','')}"))
        except Exception as e:
            result["create"] = {"code": 0, "error": str(e)}
            result["issues"].append(("Critical", f"CREATE {url}: 예외 {e}"))

    # DELETE (bulk-delete with empty ids)
    if "delete" in apis:
        url = apis["delete"]
        try:
            resp = client.post(url, json={"ids": []}, content_type="application/json")
            data = resp.get_json(silent=True) or {}
            result["delete"] = {
                "code": resp.status_code,
                "success": data.get("success"),
                "msg": (data.get("message") or data.get("error") or "")[:80],
            }
            if resp.status_code >= 500:
                result["issues"].append(("Critical", f"DELETE {url}: 서버 에러 {resp.status_code}"))
        except Exception as e:
            result["delete"] = {"code": 0, "error": str(e)}

    return result


def run_qa():
    print("=" * 74)
    print("  Blossom QA 전수 점검 시작")
    print("=" * 74)

    app = setup_app()
    client = make_authed_client(app)

    all_issues = []
    page_results = {}
    api_results = {}

    with app.app_context():
        # ── 1. 페이지 진입 ──
        print(f"\n{'='*74}")
        print(f"  [1] 페이지 진입 테스트 ({len(SIDEBAR_MENUS)}개 메뉴)")
        print(f"{'='*74}")
        p_ok = p_fail = 0
        for key, label in SIDEBAR_MENUS.items():
            pr = test_page(client, key)
            page_results[key] = pr
            ok = (pr["full"] == 200 and pr["spa"] == 200)
            icon = "OK" if ok else "FAIL"
            if ok:
                p_ok += 1
            else:
                p_fail += 1
            spa_code = pr["spa"]
            full_code = pr["full"]
            extra = ""
            if pr["issues"]:
                extra = f"  ** {pr['issues'][0][1]}"
                for sev, msg in pr["issues"]:
                    all_issues.append({"menu": label, "key": key, "severity": sev, "symptom": msg, "location": "page"})
            print(f"  [{icon:4s}] {label:30s} full={full_code}  spa={spa_code}{extra}")
        print(f"\n  합계: OK={p_ok}  FAIL={p_fail}")

        # ── 2. API CRUD ──
        print(f"\n{'='*74}")
        print(f"  [2] API CRUD 테스트 ({len(API_CRUD_MAP)}개 메뉴)")
        print(f"{'='*74}")
        a_ok = a_fail = 0
        for key, apis in API_CRUD_MAP.items():
            label = SIDEBAR_MENUS.get(key, key)
            ar = test_api(client, key, apis)
            api_results[key] = ar

            # LIST
            lr = ar.get("list")
            if lr:
                ls = lr.get("success")
                lc = lr.get("code")
                lt = lr.get("total", "?")
                l_icon = "OK" if ls is not False and lc == 200 else "FAIL"
                if l_icon == "OK":
                    a_ok += 1
                else:
                    a_fail += 1
                print(f"  [{l_icon:4s}] {label:30s} LIST  code={lc} total={lt}")
            # CREATE
            cr = ar.get("create")
            if cr:
                cs = cr.get("success")
                cc = cr.get("code")
                c_icon = "OK" if cs else "WARN" if cc in (400, 409, 422) else "FAIL"
                if c_icon == "OK":
                    a_ok += 1
                elif c_icon == "FAIL":
                    a_fail += 1
                cmsg = cr.get("msg", "")[:50]
                print(f"  [{c_icon:4s}] {'':30s} CREATE code={cc} success={cs} {cmsg}")
            # DELETE
            dr = ar.get("delete")
            if dr:
                ds = dr.get("success")
                dc = dr.get("code")
                d_icon = "OK" if ds is not False and dc < 500 else "FAIL"
                if d_icon == "OK":
                    a_ok += 1
                elif d_icon == "FAIL":
                    a_fail += 1
                print(f"  [{d_icon:4s}] {'':30s} DELETE code={dc} success={ds}")

            for sev, msg in ar.get("issues", []):
                all_issues.append({"menu": label, "key": key, "severity": sev, "symptom": msg, "location": "api"})

        print(f"\n  합계: OK={a_ok}  FAIL={a_fail}")

    # ── 3. 최종 요약 ──
    print(f"\n{'='*74}")
    print(f"  [3] 최종 요약")
    print(f"{'='*74}")
    print(f"  페이지 진입:  OK={p_ok}  FAIL={p_fail}  TOTAL={len(SIDEBAR_MENUS)}")
    print(f"  API CRUD:    OK={a_ok}  FAIL={a_fail}")
    print(f"  발견 이슈:   {len(all_issues)}건")

    if all_issues:
        print(f"\n  ── 발견된 이슈 목록 ──")
        by_sev = defaultdict(list)
        for iss in all_issues:
            by_sev[iss["severity"]].append(iss)
        for sev in ["Critical", "High", "Medium", "Low"]:
            items = by_sev.get(sev, [])
            if not items:
                continue
            print(f"\n  [{sev}] ({len(items)}건)")
            for i, iss in enumerate(items, 1):
                print(f"    {i}. {iss['menu']} ({iss['key']}) - {iss['symptom']}")

    return all_issues


if __name__ == "__main__":
    issues = run_qa()
    sys.exit(1 if issues else 0)
