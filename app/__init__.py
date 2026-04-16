from flask import Flask, render_template, request, jsonify, session, g, redirect, url_for
from sqlalchemy import text
from datetime import datetime
import time
import traceback

from config import config
from app.models import db
from app.services.work_category_service import init_work_category_table
from app.services.work_division_service import init_work_division_table
from app.services.work_status_service import init_work_status_table
from app.services.work_operation_service import init_work_operation_table
from app.services.work_group_service import init_work_group_table
from app.services.org_department_service import init_org_department_table
from app.services.org_company_service import init_org_company_table
from app.services.org_center_service import init_org_center_table
from app.services.org_rack_service import init_org_rack_table
from app.services.org_thermometer_service import init_org_thermometer_table
from app.services.org_cctv_service import init_org_cctv_table
from app.services.system_lab1_surface_service import init_system_lab1_surface_table
from app.services.system_lab2_surface_service import init_system_lab2_surface_table
from app.services.system_lab3_surface_service import init_system_lab3_surface_table
from app.services.system_lab4_surface_service import init_system_lab4_surface_table
from app.services.system_lab_thermometer_service import (
    init_system_lab1_thermometer_table,
    init_system_lab2_thermometer_table,
    init_system_lab3_thermometer_table,
    init_system_lab4_thermometer_table,
)
from app.services.system_lab_cctv_service import (
    init_system_lab1_cctv_table,
    init_system_lab2_cctv_table,
    init_system_lab3_cctv_table,
    init_system_lab4_cctv_table,
)
from app.services.vendor_manufacturer_service import init_vendor_manufacturer_table, init_vendor_manufacturer_manager_table
from app.services.vendor_maintenance_service import init_vendor_maintenance_table, init_vendor_maintenance_manager_table
from app.services.vendor_manufacturer_software_service import init_vendor_manufacturer_software_table
from app.services.vendor_maintenance_software_service import init_vendor_maintenance_software_table
from app.services.vendor_maintenance_sla_service import init_vendor_maintenance_sla_tables
from app.services.vendor_maintenance_issue_service import init_vendor_maintenance_issue_tables
from app.services.vendor_component_service import init_vendor_component_table
from app.services.vendor_hardware_service import init_vendor_hardware_table
from app.services.opex_contract_service import init_opex_contract_table
from app.services.capex_contract_service import init_capex_contract_table
from app.services.cost_contract_tab61_service import init_cost_contract_tab61_table
from app.services.cost_capex_contract_tab62_service import init_cost_capex_contract_tab62_table
from app.services.customer_member_service import init_customer_member_table
from app.services.customer_associate_service import init_customer_associate_table
from app.services.dynamic_tab_record_service import init_dynamic_tab_record_table
from app.services.customer_client_service import init_customer_client_table
from app.services.cmp_cpu_type_service import init_cmp_cpu_type_table
from app.services.cmp_memory_type_service import init_cmp_memory_type_table
from app.services.cmp_disk_type_service import init_cmp_disk_type_table
from app.services.cmp_nic_type_service import init_cmp_nic_type_table
from app.services.cmp_hba_type_service import init_cmp_hba_type_table
from app.services.cmp_etc_type_service import init_cmp_etc_type_table
from app.services.cmp_gpu_type_service import init_cmp_gpu_type_table
from app.services.hw_server_type_service import init_hw_server_type_table
from app.services.hw_storage_type_service import init_hw_storage_type_table
from app.services.hw_san_type_service import init_hw_san_type_table
from app.services.hw_network_type_service import init_hw_network_type_table
from app.services.hw_security_type_service import init_hw_security_type_table
from app.services.sw_os_type_service import init_sw_os_type_table
from app.services.sw_db_type_service import init_sw_db_type_table
from app.services.sw_middleware_type_service import init_sw_middleware_type_table
from app.services.sw_virtual_type_service import init_sw_virtual_type_table
from app.services.sw_security_type_service import init_sw_security_type_table
from app.services.sw_high_availability_type_service import init_sw_ha_type_table
from app.services.software_asset_service import init_software_asset_table
from app.services.sw_system_allocation_service import init_sw_system_allocation_table
from app.services.chat_service import init_chat_tables
from app.services.network_ip_policy_service import init_network_ip_policy_table
from app.services.network_dns_policy_service import init_network_dns_policy_table
from app.services.network_ip_diagram_service import init_network_ip_diagram_table
from app.services.network_leased_line_log_service import init_network_leased_line_log_table
from app.services.network_dns_record_service import init_network_dns_record_table
from app.services.network_dns_policy_log_service import init_network_dns_policy_log_table
from app.services.network_dns_diagram_service import init_network_dns_diagram_table
from app.services.network_ad_diagram_service import init_network_ad_diagram_table
from app.services.network_ad_service import init_network_ad_account_tables, init_network_ad_table
from app.services.network_ad_fqdn_service import init_network_ad_fqdn_table
from app.services.upload_meta_service import init_upload_meta_table
from app.services.tab15_file_service import init_tab15_file_table
from app.services.cost_opex_hardware_config_service import init_cost_opex_hardware_config_table
from app.services.insight_item_service import init_insight_item_table
from app.services.access_entry_register_service import init_access_entry_register_table
from app.services.data_delete_register_service import init_data_delete_register_table
from app.services.data_delete_system_service import init_data_delete_system_table
from app.services.hw_interface_service import init_hw_interface_table
from app.services.hw_interface_detail_service import init_hw_interface_detail_table
from app.services.tab32_assign_group_service import init_tab32_assign_group_tables
from app.services.hw_maintenance_contract_service import init_hw_maintenance_contract_table
from app.services.hw_activate_service import init_hw_activate_table
from app.services.hw_firewalld_service import init_hw_firewalld_table
from app.services.hw_frame_frontbay_service import init_hw_frame_frontbay_table
from app.services.quality_type_service import init_quality_type_table
from app.services.page_tab_config_service import init_page_tab_config_table
from app.services.brand_setting_service import init_brand_setting_table
from flask_migrate import Migrate
import os


CATEGORY_PK_GUARD_TABLES = (
    'biz_work_category',
    'biz_work_division',
    'biz_work_status',
    'biz_work_operation',
    'biz_work_group',
    'hw_server_type',
    'hw_storage_type',
    'hw_san_type',
    'hw_network_type',
    'hw_security_type',
    'sw_os_type',
    'sw_db_type',
    'sw_middleware_type',
    'sw_virtual_type',
    'sw_security_sw_type',
    'sw_ha_type',
    'cmp_cpu_type',
    'cmp_memory_type',
    'cmp_disk_type',
    'cmp_nic_type',
    'cmp_hba_type',
    'cmp_etc_type',
    'cmp_gpu_type',
    'org_company',
    'org_department',
    'org_center',
    'biz_customer_member',
    'biz_customer_associate',
    'biz_customer_client',
    'biz_vendor_manufacturer',
    'biz_vendor_maintenance',
)


CATEGORY_CODE_GUARD_COLUMNS = {
    'biz_work_category': 'category_code',
    'biz_work_division': 'division_code',
    'biz_work_status': 'status_code',
    'biz_work_operation': 'operation_code',
    'biz_work_group': 'group_code',
    'hw_server_type': 'server_code',
    'hw_storage_type': 'storage_code',
    'hw_san_type': 'san_code',
    'hw_network_type': 'network_code',
    'hw_security_type': 'security_code',
    'sw_os_type': 'os_code',
    'sw_db_type': 'db_code',
    'sw_middleware_type': 'middleware_code',
    'sw_virtual_type': 'virtual_code',
    'sw_security_sw_type': 'secsw_code',
    'sw_ha_type': 'ha_code',
    'cmp_cpu_type': 'cpu_code',
    'cmp_memory_type': 'memory_code',
    'cmp_disk_type': 'disk_code',
    'cmp_nic_type': 'nic_code',
    'cmp_hba_type': 'hba_code',
    'cmp_etc_type': 'etc_code',
    'cmp_gpu_type': 'gpu_code',
    'org_company': 'company_code',
    'org_department': 'dept_code',
    'org_center': 'center_code',
    'biz_customer_member': 'customer_code',
    'biz_customer_associate': 'associate_code',
    'biz_customer_client': 'customer_code',
    'biz_vendor_manufacturer': 'manufacturer_code',
    'biz_vendor_maintenance': 'maintenance_code',
}


def _ensure_org_user_view(app: Flask) -> None:
    """Provide backward-compatible "user" view backed by org_user."""
    # Legacy raw SQL expects historical columns (created_by/updated_by/is_deleted)
    # that no longer exist on org_user, so map them to safe defaults.
    ddl_create = text(
        """
        CREATE VIEW "user" AS
        SELECT
            id,
            emp_no,
            name,
            nickname,
            company,
            department,
            location,
            ext_phone,
            mobile_phone,
            email,
            role,
            allowed_ip,
            job,
            profile_image,
            created_at,
            NULL AS created_by,
            updated_at,
            NULL AS updated_by,
            0 AS is_deleted,
            last_login_at,
            password_changed_at,
            password_expires_at,
            locked,
            fail_cnt,
            note
        FROM org_user
        """
    )
    try:
        with app.app_context():
            engine = db.get_engine()
            is_mysql = 'mysql' in str(engine.url) or 'mariadb' in str(engine.url)
            with engine.begin() as conn:
                if is_mysql:
                    conn.execute(text('DROP VIEW IF EXISTS `user`'))
                    conn.execute(text(ddl_create.text.replace('"user"', '`user`')))
                else:
                    conn.execute(text('DROP VIEW IF EXISTS "user"'))
                    conn.execute(ddl_create)
    except Exception as exc:
        try:
            print('[org-user-view] ensure failed:', exc, flush=True)
            traceback.print_exc()
        except Exception:
            pass


def _enforce_category_pk_uniqueness(app: Flask) -> None:
    """Ensure category master tables never allow duplicate primary/business keys."""
    with app.app_context():
        engine = db.engine
        dialect = engine.url.get_backend_name()

        with engine.begin() as conn:
            for table in CATEGORY_PK_GUARD_TABLES:
                if dialect == 'sqlite':
                    row = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name=:table"), {'table': table}).fetchone()
                    if not row:
                        continue

                    table_info = conn.execute(text(f"PRAGMA table_info({table})")).mappings().all()
                    has_id_pk = any((col.get('name') == 'id' and int(col.get('pk') or 0) > 0) for col in table_info)
                    has_id_col = any(col.get('name') == 'id' for col in table_info)

                    if has_id_col and not has_id_pk:
                        idx_name = f"ux_{table}_id"
                        conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {idx_name} ON {table}(id)"))

                duplicate = conn.execute(
                    text(f"SELECT id, COUNT(*) AS c FROM {table} GROUP BY id HAVING COUNT(*) > 1 LIMIT 1")
                ).fetchone()
                if duplicate:
                    raise RuntimeError(f"[pk-guard] duplicate id detected in {table}: id={duplicate[0]}, count={duplicate[1]}")

            for table, code_col in CATEGORY_CODE_GUARD_COLUMNS.items():
                if dialect == 'sqlite':
                    row = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name=:table"), {'table': table}).fetchone()
                    if not row:
                        continue
                    idx_name = f"ux_{table}_{code_col}"
                    conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {idx_name} ON {table}({code_col})"))

                duplicate = conn.execute(
                    text(
                        f"SELECT {code_col}, COUNT(*) AS c "
                        f"FROM {table} "
                        f"WHERE {code_col} IS NOT NULL AND TRIM({code_col}) <> '' "
                        f"GROUP BY {code_col} HAVING COUNT(*) > 1 LIMIT 1"
                    )
                ).fetchone()
                if duplicate:
                    raise RuntimeError(
                        f"[pk-guard] duplicate business key detected in {table}.{code_col}: "
                        f"value={duplicate[0]}, count={duplicate[1]}"
                    )

def create_app(config_name='default'):
    # static 폴더가 프로젝트 루트(static/)에 있으므로 static_folder를 명시적으로 지정
    app = Flask(__name__, static_folder='../static', template_folder='templates')
    
    # 설정 로드
    app.config.from_object(config[config_name])

    # ── 보안 미들웨어 초기화 (헤더, CSRF, Rate Limiting, 감사 로그) ──
    from app.security import init_security
    init_security(app)

    # Request timing instrumentation (DEV/DEBUG only)
    # Helps diagnose slow tab/page transitions by exposing server processing time.
    if app.config.get('DEBUG'):
        @app.before_request
        def _bls_timing_before_request():
            try:
                g._bls_req_start = time.perf_counter()
            except Exception:
                pass

        @app.after_request
        def _bls_timing_after_request(response):
            try:
                start = getattr(g, '_bls_req_start', None)
                if start is not None:
                    dur_ms = (time.perf_counter() - start) * 1000.0
                    existing = response.headers.get('Server-Timing')
                    entry = f"app;dur={dur_ms:.1f}"
                    response.headers['Server-Timing'] = f"{existing}, {entry}" if existing else entry
                    response.headers['X-Response-Time-ms'] = f"{dur_ms:.1f}"
            except Exception:
                pass
            # Static assets with ?v= query string: allow browser caching (1 hour)
            # to avoid re-downloading blossom.css/blossom.js on every page load.
            # Non-versioned JS: no caching to avoid stale SPA scripts.
            try:
                if request.path.startswith('/static/'):
                    qs = request.query_string.decode('utf-8', errors='ignore') if request.query_string else ''
                    if 'v=' in qs or '_ts=' in qs:
                        response.headers['Cache-Control'] = 'public, max-age=3600, immutable'
                    else:
                        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
                        response.headers['Pragma'] = 'no-cache'
                        response.headers['Expires'] = '0'
                elif request.path.endswith('.js'):
                    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
                    response.headers['Pragma'] = 'no-cache'
                    response.headers['Expires'] = '0'
            except Exception:
                pass
            return response
    
    # ── SSE 자동 브로드캐스트: mutating API 호출 성공 시 연관 엔터티 invalidation ──
    @app.after_request
    def _bls_sse_broadcast(response):
        try:
            if request.method in ('POST', 'PUT', 'PATCH', 'DELETE') \
               and request.path.startswith('/api/') \
               and not request.path.startswith('/api/sse/') \
               and response.status_code in (200, 201):
                from app.routes.sse_api import notify_entity_change
                entity = _detect_entity_from_path(request.path)
                if entity:
                    action = 'create' if request.method == 'POST' and 'bulk-delete' not in request.path \
                             else 'delete' if 'bulk-delete' in request.path or request.method == 'DELETE' \
                             else 'update'
                    notify_entity_change(entity, action)
        except Exception:
            pass
        return response

    def _detect_entity_from_path(path):
        """API 경로에서 엔터티명 추출"""
        _map = {
            '/api/hw/':           'hardware',
            '/api/hw/servers':    'server',
            '/api/net/':          'network',
            '/api/sw/':           'software',
            '/api/prj/':          'project',
            '/api/vendors':       'vendor',
            '/api/users':         'user',
            '/api/departments':   'department',
            '/api/dashboard':     'dashboard',
            '/api/policies':      'policy',
            '/api/maintenance':   'maintenance',
            '/api/ip':            'ip',
            '/api/security':      'security',
            '/api/governance':    'policy',
        }
        for prefix, entity in _map.items():
            if path.startswith(prefix):
                return entity
        return None

    # 데이터베이스 초기화 및 마이그레이션 연결
    db.init_app(app)
    Migrate(app, db)
    _ensure_org_user_view(app)
    _enforce_category_pk_uniqueness(app)

    # ── org_user.location 컬럼 마이그레이션 ──
    def _ensure_org_user_location(application):
        try:
            with application.app_context():
                engine = db.get_engine()
                with engine.connect() as conn:
                    try:
                        conn.execute(db.text("SELECT location FROM org_user LIMIT 1"))
                    except Exception:
                        try:
                            conn.execute(db.text("ALTER TABLE org_user ADD COLUMN location VARCHAR(128)"))
                            conn.commit()
                            print('[org-user] added location column', flush=True)
                        except Exception as _e:
                            print('[org-user] location column migration failed:', _e, flush=True)
        except Exception as _e2:
            print('[org-user] location migration outer error:', _e2, flush=True)
    _ensure_org_user_location(app)

    # ── 보안 감사 로그 테이블 생성 (DB 초기화 후) ──
    from app.security import init_security_tables
    init_security_tables(app)

    # ── 권한 테이블 자동 마이그레이션 ──
    def _ensure_permission_tables(application):
        """새 권한 테이블(menu, *_menu_permission, permission_audit_log) 자동 생성 + 메뉴 시드"""
        try:
            with application.app_context():
                engine = db.engine
                is_sqlite = 'sqlite' in str(engine.url)

                if is_sqlite:
                    conn = engine.raw_connection()
                    cur = conn.cursor()
                    # role 테이블 insight 컬럼 (레거시 호환)
                    try:
                        cur.execute("SELECT insight_read FROM role LIMIT 1")
                    except Exception:
                        try:
                            cur.execute("ALTER TABLE role ADD COLUMN insight_read BOOLEAN DEFAULT 0")
                            cur.execute("ALTER TABLE role ADD COLUMN insight_write BOOLEAN DEFAULT 0")
                            conn.commit()
                        except Exception:
                            pass
                    # menu 테이블
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS menu (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            menu_code VARCHAR(64) UNIQUE NOT NULL,
                            menu_name VARCHAR(128) NOT NULL,
                            parent_menu_id INTEGER REFERENCES menu(id),
                            sort_order INTEGER DEFAULT 0,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    """)
                    # role_menu_permission
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS role_menu_permission (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            role_id INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
                            menu_id INTEGER NOT NULL REFERENCES menu(id) ON DELETE CASCADE,
                            permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
                            UNIQUE(role_id, menu_id)
                        )
                    """)
                    # department_menu_permission
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS department_menu_permission (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            dept_id INTEGER NOT NULL REFERENCES org_department(id) ON DELETE CASCADE,
                            menu_id INTEGER NOT NULL REFERENCES menu(id) ON DELETE CASCADE,
                            permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
                            UNIQUE(dept_id, menu_id)
                        )
                    """)
                    # user_menu_permission
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS user_menu_permission (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL REFERENCES org_user(id) ON DELETE CASCADE,
                            menu_id INTEGER NOT NULL REFERENCES menu(id) ON DELETE CASCADE,
                            permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
                            UNIQUE(user_id, menu_id)
                        )
                    """)
                    # permission_audit_log (확장)
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS permission_audit_log (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            target_type VARCHAR(20) NOT NULL DEFAULT 'role',
                            target_id INTEGER NOT NULL DEFAULT 0,
                            menu_code VARCHAR(64) NOT NULL,
                            before_permission VARCHAR(10),
                            after_permission VARCHAR(10),
                            changed_by VARCHAR(128),
                            changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            role_id INTEGER,
                            role_name VARCHAR(128)
                        )
                    """)
                    # target_type 컬럼 추가 (기존 테이블 호환)
                    try:
                        cur.execute("SELECT target_type FROM permission_audit_log LIMIT 1")
                    except Exception:
                        try:
                            cur.execute("ALTER TABLE permission_audit_log ADD COLUMN target_type VARCHAR(20) NOT NULL DEFAULT 'role'")
                            cur.execute("ALTER TABLE permission_audit_log ADD COLUMN target_id INTEGER NOT NULL DEFAULT 0")
                            conn.commit()
                        except Exception:
                            pass
                    conn.commit()
                    conn.close()
                else:
                    # MySQL/PostgreSQL
                    from app.models import (Menu, RoleMenuPermission, DepartmentMenuPermission,
                                            UserMenuPermission, PermissionAuditLog)
                    for tbl in [Menu, RoleMenuPermission, DepartmentMenuPermission,
                                UserMenuPermission, PermissionAuditLog]:
                        tbl.__table__.create(bind=engine, checkfirst=True)

                # 메뉴 시드 데이터
                from app.services.permission_service import seed_menus
                cnt = seed_menus()
                if cnt:
                    print(f'[permission_migration] seeded {cnt} menus', flush=True)

        except Exception as e:
            print('[permission_migration] error:', e, flush=True)
    _ensure_permission_tables(app)

    # ── 상세화면(탭) 권한 테이블 자동 마이그레이션 ──
    def _ensure_detail_perm_tables(application):
        """상세화면 권한 테이블(detail_page, *_detail_permission) 자동 생성 + 시드"""
        try:
            with application.app_context():
                engine = db.engine
                is_sqlite = 'sqlite' in str(engine.url)
                if is_sqlite:
                    conn = engine.raw_connection()
                    cur = conn.cursor()
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS detail_page (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            page_code VARCHAR(64) UNIQUE NOT NULL,
                            page_name VARCHAR(128) NOT NULL,
                            parent_page_id INTEGER REFERENCES detail_page(id),
                            sort_order INTEGER DEFAULT 0,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    """)
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS role_detail_permission (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            role_id INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
                            page_id INTEGER NOT NULL REFERENCES detail_page(id) ON DELETE CASCADE,
                            permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
                            UNIQUE(role_id, page_id)
                        )
                    """)
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS department_detail_permission (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            dept_id INTEGER NOT NULL REFERENCES org_department(id) ON DELETE CASCADE,
                            page_id INTEGER NOT NULL REFERENCES detail_page(id) ON DELETE CASCADE,
                            permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
                            UNIQUE(dept_id, page_id)
                        )
                    """)
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS user_detail_permission (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL REFERENCES org_user(id) ON DELETE CASCADE,
                            page_id INTEGER NOT NULL REFERENCES detail_page(id) ON DELETE CASCADE,
                            permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
                            UNIQUE(user_id, page_id)
                        )
                    """)
                    conn.commit()
                    conn.close()
                else:
                    from app.models import (DetailPage, RoleDetailPermission,
                                            DepartmentDetailPermission, UserDetailPermission)
                    for tbl in [DetailPage, RoleDetailPermission, DepartmentDetailPermission,
                                UserDetailPermission]:
                        tbl.__table__.create(bind=engine, checkfirst=True)

                from app.services.permission_service import seed_detail_pages
                cnt = seed_detail_pages()
                if cnt:
                    print(f'[detail_perm_migration] seeded {cnt} detail pages', flush=True)
        except Exception as e:
            print('[detail_perm_migration] error:', e, flush=True)
    _ensure_detail_perm_tables(app)

    # ── 테이블 초기화 (단일 app_context 블록으로 통합) ──
    with app.app_context():
        # ── 출입 권한 구역 테이블 자동 생성 + 시드 ──
        try:
            from app.routes.api import _ensure_access_zone_tables
            _ensure_access_zone_tables()
        except Exception as zone_init_err:
            try:
                print('[access-zone] table init failed:', zone_init_err, flush=True)
            except Exception:
                pass

        # ── 권한 변경 기록 테이블 자동 생성 ──
        try:
            from app.routes.api import _ensure_authority_record_table
            _ensure_authority_record_table()
        except Exception as auth_rec_err:
            try:
                print('[authority-record] table init failed:', auth_rec_err, flush=True)
            except Exception:
                pass

        try:
            init_insight_item_table(app)
        except Exception as insight_init_err:
            try:
                print('[insight-item] table init failed:', insight_init_err, flush=True)
            except Exception:
                pass
        try:
            init_work_category_table(app)
        except Exception as work_init_err:
            try:
                print('[work-category] table init failed:', work_init_err, flush=True)
            except Exception:
                pass
        try:
            init_work_division_table(app)
        except Exception as division_init_err:
            try:
                print('[work-division] table init failed:', division_init_err, flush=True)
            except Exception:
                pass
        try:
            init_work_status_table(app)
        except Exception as status_init_err:
            try:
                print('[work-status] table init failed:', status_init_err, flush=True)
            except Exception:
                pass
        try:
            init_tab32_assign_group_tables(app)
        except Exception as asg32_init_err:
            try:
                print('[tab32-assign-group] table init failed:', asg32_init_err, flush=True)
            except Exception:
                pass
        try:
            init_work_operation_table(app)
        except Exception as operation_init_err:
            try:
                print('[work-operation] table init failed:', operation_init_err, flush=True)
            except Exception:
                pass
        try:
            init_org_department_table(app)
        except Exception as dept_init_err:
            try:
                print('[org-department] table init failed:', dept_init_err, flush=True)
            except Exception:
                pass
        try:
            init_work_group_table(app)
        except Exception as group_init_err:
            try:
                print('[work-group] table init failed:', group_init_err, flush=True)
            except Exception:
                pass

        try:
            init_hw_interface_table(app)
        except Exception as iface_init_err:
            try:
                print('[hw-interface] table init failed:', iface_init_err, flush=True)
            except Exception:
                pass

        try:
            init_hw_interface_detail_table(app)
        except Exception as iface_detail_init_err:
            try:
                print('[hw-interface-detail] table init failed:', iface_detail_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_maintenance_contract_table(app)
        except Exception as maint_init_err:
            try:
                print('[hw-maintenance-contract] table init failed:', maint_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_activate_table(app)
        except Exception as activate_init_err:
            try:
                print('[hw-activate] table init failed:', activate_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_firewalld_table(app)
        except Exception as firewalld_init_err:
            try:
                print('[hw-firewalld] table init failed:', firewalld_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_frame_frontbay_table(app)
        except Exception as frontbay_init_err:
            try:
                print('[hw-frame-frontbay] table init failed:', frontbay_init_err, flush=True)
            except Exception:
                pass
        try:
            init_quality_type_table(app)
        except Exception as qt_init_err:
            try:
                print('[quality-type] table init failed:', qt_init_err, flush=True)
            except Exception:
                pass
        try:
            init_org_company_table(app)
        except Exception as company_init_err:
            try:
                print('[org-company] table init failed:', company_init_err, flush=True)
            except Exception:
                pass
        try:
            init_org_center_table(app)
        except Exception as center_init_err:
            try:
                print('[org-center] table init failed:', center_init_err, flush=True)
            except Exception:
                pass
        try:
            init_org_rack_table(app)
        except Exception as rack_init_err:
            try:
                print('[org-rack] table init failed:', rack_init_err, flush=True)
            except Exception:
                pass
        try:
            init_org_thermometer_table(app)
        except Exception as thermo_init_err:
            try:
                print('[org-thermometer] table init failed:', thermo_init_err, flush=True)
            except Exception:
                pass
        try:
            init_org_cctv_table(app)
        except Exception as cctv_init_err:
            try:
                print('[org-cctv] table init failed:', cctv_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab1_surface_table(app)
        except Exception as lab_surface_init_err:
            try:
                print('[system-lab1-surface] table init failed:', lab_surface_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab2_surface_table(app)
        except Exception as lab_surface_init_err:
            try:
                print('[system-lab2-surface] table init failed:', lab_surface_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab3_surface_table(app)
        except Exception as lab_surface_init_err:
            try:
                print('[system-lab3-surface] table init failed:', lab_surface_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab4_surface_table(app)
        except Exception as lab_surface_init_err:
            try:
                print('[system-lab4-surface] table init failed:', lab_surface_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab1_thermometer_table(app)
        except Exception as lab_thermo_init_err:
            try:
                print('[system-lab1-thermometer] table init failed:', lab_thermo_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab2_thermometer_table(app)
        except Exception as lab_thermo_init_err:
            try:
                print('[system-lab2-thermometer] table init failed:', lab_thermo_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab3_thermometer_table(app)
        except Exception as lab_thermo_init_err:
            try:
                print('[system-lab3-thermometer] table init failed:', lab_thermo_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab4_thermometer_table(app)
        except Exception as lab_thermo_init_err:
            try:
                print('[system-lab4-thermometer] table init failed:', lab_thermo_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab1_cctv_table(app)
        except Exception as lab_cctv_init_err:
            try:
                print('[system-lab1-cctv] table init failed:', lab_cctv_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab2_cctv_table(app)
        except Exception as lab_cctv_init_err:
            try:
                print('[system-lab2-cctv] table init failed:', lab_cctv_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab3_cctv_table(app)
        except Exception as lab_cctv_init_err:
            try:
                print('[system-lab3-cctv] table init failed:', lab_cctv_init_err, flush=True)
            except Exception:
                pass
        try:
            init_system_lab4_cctv_table(app)
        except Exception as lab_cctv_init_err:
            try:
                print('[system-lab4-cctv] table init failed:', lab_cctv_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_manufacturer_table(app)
        except Exception as vendor_init_err:
            try:
                print('[vendor-manufacturer] table init failed:', vendor_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_manufacturer_manager_table(app)
        except Exception as vendor_mgr_init_err:
            try:
                print('[vendor-manufacturer-manager] table init failed:', vendor_mgr_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_maintenance_table(app)
        except Exception as vendor_maint_init_err:
            try:
                print('[vendor-maintenance] table init failed:', vendor_maint_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_maintenance_manager_table(app)
        except Exception as vendor_maint_mgr_init_err:
            try:
                print('[vendor-maintenance-manager] table init failed:', vendor_maint_mgr_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_manufacturer_software_table(app)
        except Exception as vendor_sw_init_err:
            try:
                print('[vendor-manufacturer-software] table init failed:', vendor_sw_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_maintenance_software_table(app)
        except Exception as vendor_maint_sw_init_err:
            try:
                print('[vendor-maintenance-software] table init failed:', vendor_maint_sw_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_maintenance_sla_tables(app)
        except Exception as sla_init_err:
            try:
                print('[vendor-maintenance-sla] table init failed:', sla_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_maintenance_issue_tables(app)
        except Exception as issue_init_err:
            try:
                print('[vendor-maintenance-issue] table init failed:', issue_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_component_table(app)
        except Exception as vendor_component_init_err:
            try:
                print('[vendor-component] table init failed:', vendor_component_init_err, flush=True)
            except Exception:
                pass
        try:
            init_vendor_hardware_table(app)
        except Exception as vendor_hw_init_err:
            try:
                print('[vendor-hardware] table init failed:', vendor_hw_init_err, flush=True)
            except Exception:
                pass
        try:
            init_opex_contract_table(app)
        except Exception as opex_contract_init_err:
            try:
                print('[opex-contract] table init failed:', opex_contract_init_err, flush=True)
            except Exception:
                pass
        try:
            init_capex_contract_table(app)
        except Exception as capex_contract_init_err:
            try:
                print('[capex-contract] table init failed:', capex_contract_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cost_contract_tab61_table(app)
        except Exception as tab71_opex_init_err:
            try:
                print('[tab71-opex] table init failed:', tab71_opex_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cost_capex_contract_tab62_table(app)
        except Exception as tab62_contract_init_err:
            try:
                print('[tab62-capex-contract] table init failed:', tab62_contract_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cmp_cpu_type_table(app)
        except Exception as cmp_cpu_type_init_err:
            try:
                print('[cmp-cpu-type] table init failed:', cmp_cpu_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cmp_memory_type_table(app)
        except Exception as cmp_memory_type_init_err:
            try:
                print('[cmp-memory-type] table init failed:', cmp_memory_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cmp_disk_type_table(app)
        except Exception as cmp_disk_type_init_err:
            try:
                print('[cmp-disk-type] table init failed:', cmp_disk_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cmp_gpu_type_table(app)
        except Exception as cmp_gpu_type_init_err:
            try:
                print('[cmp-gpu-type] table init failed:', cmp_gpu_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cmp_nic_type_table(app)
        except Exception as cmp_nic_type_init_err:
            try:
                print('[cmp-nic-type] table init failed:', cmp_nic_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cmp_hba_type_table(app)
        except Exception as cmp_hba_type_init_err:
            try:
                print('[cmp-hba-type] table init failed:', cmp_hba_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_cmp_etc_type_table(app)
        except Exception as cmp_etc_type_init_err:
            try:
                print('[cmp-etc-type] table init failed:', cmp_etc_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_server_type_table(app)
        except Exception as hw_server_type_init_err:
            try:
                print('[hw-server-type] table init failed:', hw_server_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_storage_type_table(app)
        except Exception as hw_storage_type_init_err:
            try:
                print('[hw-storage-type] table init failed:', hw_storage_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_san_type_table(app)
        except Exception as hw_san_type_init_err:
            try:
                print('[hw-san-type] table init failed:', hw_san_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_network_type_table(app)
        except Exception as hw_network_type_init_err:
            try:
                print('[hw-network-type] table init failed:', hw_network_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_hw_security_type_table(app)
        except Exception as hw_security_type_init_err:
            try:
                print('[hw-security-type] table init failed:', hw_security_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_sw_os_type_table(app)
        except Exception as sw_os_type_init_err:
            try:
                print('[sw-os-type] table init failed:', sw_os_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_sw_db_type_table(app)
        except Exception as sw_db_type_init_err:
            try:
                print('[sw-db-type] table init failed:', sw_db_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_sw_middleware_type_table(app)
        except Exception as sw_middleware_type_init_err:
            try:
                print('[sw-middleware-type] table init failed:', sw_middleware_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_sw_virtual_type_table(app)
        except Exception as sw_virtual_type_init_err:
            try:
                print('[sw-virtual-type] table init failed:', sw_virtual_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_sw_ha_type_table(app)
        except Exception as sw_ha_type_init_err:
            try:
                print('[sw-ha-type] table init failed:', sw_ha_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_sw_security_type_table(app)
        except Exception as sw_security_type_init_err:
            try:
                print('[sw-security-type] table init failed:', sw_security_type_init_err, flush=True)
            except Exception:
                pass
        try:
            init_chat_tables(app)
        except Exception as chat_init_err:
            try:
                print('[chat] table init failed:', chat_init_err, flush=True)
            except Exception:
                pass
        try:
            init_software_asset_table(app)
        except Exception as sw_asset_init_err:
            try:
                print('[software-asset] table init failed:', sw_asset_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_dns_policy_table(app)
        except Exception as network_dns_init_err:
            try:
                print('[network-dns-policy] table init failed:', network_dns_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_dns_policy_log_table(app)
        except Exception as network_dns_log_init_err:
            try:
                print('[network-dns-policy-log] table init failed:', network_dns_log_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_dns_record_table(app)
        except Exception as network_dns_record_init_err:
            try:
                print('[network-dns-record] table init failed:', network_dns_record_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_dns_diagram_table(app)
        except Exception as network_dns_diagram_init_err:
            try:
                print('[network-dns-diagram] table init failed:', network_dns_diagram_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_ip_policy_table(app)
        except Exception as network_ip_init_err:
            try:
                print('[network-ip-policy] table init failed:', network_ip_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_ip_diagram_table(app)
        except Exception as network_ip_diagram_init_err:
            try:
                print('[network-ip-diagram] table init failed:', network_ip_diagram_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_leased_line_log_table(app)
        except Exception as network_leased_line_log_init_err:
            try:
                print('[network-leased-line-log] table init failed:', network_leased_line_log_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_ad_table(app)
        except Exception as network_ad_init_err:
            try:
                print('[network-ad] table init failed:', network_ad_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_ad_account_tables(app)
        except Exception as network_ad_acc_init_err:
            try:
                print('[network-ad] account/log table init failed:', network_ad_acc_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_ad_diagram_table(app)
        except Exception as network_ad_diagram_init_err:
            try:
                print('[network-ad-diagram] table init failed:', network_ad_diagram_init_err, flush=True)
            except Exception:
                pass

        try:
            init_upload_meta_table(app)
        except Exception as upload_meta_init_err:
            try:
                print('[upload-meta] table init failed:', upload_meta_init_err, flush=True)
            except Exception:
                pass

        try:
            init_tab15_file_table(app)
        except Exception as tab15_init_err:
            try:
                print('[tab15-file] table init failed:', tab15_init_err, flush=True)
            except Exception:
                pass

        try:
            init_cost_opex_hardware_config_table(app)
        except Exception as cost_opex_hw_cfg_init_err:
            try:
                print('[cost-opex-hardware-config] table init failed:', cost_opex_hw_cfg_init_err, flush=True)
            except Exception:
                pass
        try:
            init_network_ad_fqdn_table(app)
        except Exception as network_ad_fqdn_init_err:
            try:
                print('[network-ad-fqdn] table init failed:', network_ad_fqdn_init_err, flush=True)
            except Exception:
                pass
        try:
            init_access_entry_register_table(app)
        except Exception as access_entry_init_err:
            try:
                print('[access-entry-register] table init failed:', access_entry_init_err, flush=True)
            except Exception:
                pass
        try:
            init_data_delete_register_table(app)
        except Exception as data_delete_init_err:
            try:
                print('[data-delete-register] table init failed:', data_delete_init_err, flush=True)
            except Exception:
                pass
        try:
            init_data_delete_system_table(app)
        except Exception as data_delete_system_init_err:
            try:
                print('[data-delete-system] table init failed:', data_delete_system_init_err, flush=True)
            except Exception:
                pass
        try:
            init_customer_member_table(app)
        except Exception as customer_member_init_err:
            try:
                print('[customer-member] table init failed:', customer_member_init_err, flush=True)
            except Exception:
                pass
        try:
            init_dynamic_tab_record_table(app)
        except Exception as dtr_init_err:
            try:
                print('[dynamic-tab-record] table init failed:', dtr_init_err, flush=True)
            except Exception:
                pass
        try:
            init_customer_associate_table(app)
        except Exception as customer_associate_init_err:
            try:
                print('[customer-associate] table init failed:', customer_associate_init_err, flush=True)
            except Exception:
                pass
        try:
            init_customer_client_table(app)
        except Exception as customer_client_init_err:
            try:
                print('[customer-client] table init failed:', customer_client_init_err, flush=True)
            except Exception:
                pass

        try:
            init_sw_system_allocation_table(app)
        except Exception as sw_system_alloc_init_err:
            try:
                print('[sw-system-allocation] table init failed:', sw_system_alloc_init_err, flush=True)
            except Exception:
                pass

        # SMTP 설정 테이블 (singleton)
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS smtp_config (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    host        TEXT NOT NULL DEFAULT 'smtp.gmail.com',
                    port        INTEGER NOT NULL DEFAULT 587,
                    encryption  TEXT NOT NULL DEFAULT 'STARTTLS',
                    username    TEXT NOT NULL DEFAULT '',
                    password    TEXT NOT NULL DEFAULT '',
                    from_name   TEXT NOT NULL DEFAULT 'Blossom',
                    from_email  TEXT NOT NULL DEFAULT '',
                    use_auth    INTEGER NOT NULL DEFAULT 1,
                    verify_cert INTEGER NOT NULL DEFAULT 1,
                    reply_to    TEXT NOT NULL DEFAULT '',
                    updated_at  TEXT
                )
            """))
            db.session.commit()
            # 새 컬럼 마이그레이션 (기존 테이블에 컬럼 부재 시 추가)
            for _col, _def in [('use_auth', '1'), ('verify_cert', '1'), ('reply_to', "''")]:
                try:
                    db.session.execute(db.text(f"ALTER TABLE smtp_config ADD COLUMN {_col} {'INTEGER' if _def in ('0','1') else 'TEXT'} NOT NULL DEFAULT {_def}"))
                    db.session.commit()
                except Exception:
                    db.session.rollback()   # 이미 존재하면 무시
            # 기존 하드코딩 설정이 있었으므로, 행이 없으면 시드
            _existing = db.session.execute(db.text("SELECT id FROM smtp_config WHERE id=1")).fetchone()
            if not _existing:
                db.session.execute(db.text("""
                    INSERT INTO smtp_config (id, host, port, encryption, username, password, from_name, from_email)
                    VALUES (1, 'smtp.gmail.com', 587, 'STARTTLS',
                            'blossom9601@gmail.com', 'gmdtiomzdaamjfmb', 'Blossom', '')
                """))
                db.session.commit()
                print('[smtp-config] seeded default row', flush=True)
        except Exception as smtp_init_err:
            try:
                print('[smtp-config] table init failed:', smtp_init_err, flush=True)
            except Exception:
                pass

        # ── MFA / SMS / OTP 관련 테이블 생성 ──
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS mfa_config (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    enabled              INTEGER NOT NULL DEFAULT 0,
                    default_type         TEXT    NOT NULL DEFAULT 'totp',
                    totp_enabled         INTEGER NOT NULL DEFAULT 1,
                    sms_enabled          INTEGER NOT NULL DEFAULT 1,
                    email_enabled        INTEGER NOT NULL DEFAULT 1,
                    company_otp_enabled  INTEGER NOT NULL DEFAULT 0,
                    grace_period_days    INTEGER NOT NULL DEFAULT 0,
                    remember_device_days INTEGER NOT NULL DEFAULT 7,
                    totp_secret          TEXT    NOT NULL DEFAULT '',
                    sms_number           TEXT    NOT NULL DEFAULT '',
                    email                TEXT    NOT NULL DEFAULT '',
                    allow_user_choice    INTEGER NOT NULL DEFAULT 1,
                    code_length          INTEGER NOT NULL DEFAULT 6,
                    code_ttl_seconds     INTEGER NOT NULL DEFAULT 300,
                    updated_at           TEXT
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS sms_config (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider      TEXT    NOT NULL DEFAULT 'coolsms',
                    api_key       TEXT    NOT NULL DEFAULT '',
                    api_secret    TEXT    NOT NULL DEFAULT '',
                    sender_number TEXT    NOT NULL DEFAULT '',
                    enabled       INTEGER NOT NULL DEFAULT 0,
                    updated_at    TEXT
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS company_otp_config (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider      TEXT    NOT NULL DEFAULT 'initech',
                    api_endpoint  TEXT    NOT NULL DEFAULT '',
                    api_key       TEXT    NOT NULL DEFAULT '',
                    api_secret    TEXT    NOT NULL DEFAULT '',
                    server_code   TEXT    NOT NULL DEFAULT '',
                    timeout       INTEGER NOT NULL DEFAULT 5,
                    enabled       INTEGER NOT NULL DEFAULT 0,
                    updated_at    TEXT
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS mfa_pending_codes (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    emp_no     TEXT    NOT NULL,
                    mfa_type   TEXT    NOT NULL,
                    code       TEXT    NOT NULL,
                    created_at DATETIME,
                    expires_at DATETIME NOT NULL,
                    used       INTEGER DEFAULT 0
                )
            """))
            db.session.commit()
            print('[mfa-tables] mfa_config / sms_config / company_otp_config / mfa_pending_codes ready', flush=True)
        except Exception as mfa_init_err:
            try:
                print('[mfa-tables] table init failed:', mfa_init_err, flush=True)
            except Exception:
                pass

        # ── 보안정책 테이블 (security_policy + security_policy_log + banned_passwords) ──
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS security_policy (
                    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
                    min_length               INTEGER NOT NULL DEFAULT 12,
                    max_length               INTEGER NOT NULL DEFAULT 64,
                    expiry_days              INTEGER NOT NULL DEFAULT 90,
                    history                  INTEGER NOT NULL DEFAULT 5,
                    fail_lock_threshold      INTEGER NOT NULL DEFAULT 5,
                    lock_duration_minutes    INTEGER NOT NULL DEFAULT 30,
                    require_uppercase        INTEGER NOT NULL DEFAULT 1,
                    require_number           INTEGER NOT NULL DEFAULT 1,
                    require_symbol           INTEGER NOT NULL DEFAULT 1,
                    block_common_passwords   INTEGER NOT NULL DEFAULT 1,
                    block_user_id            INTEGER NOT NULL DEFAULT 1,
                    block_personal_info      INTEGER NOT NULL DEFAULT 1,
                    block_sequential_chars   INTEGER NOT NULL DEFAULT 1,
                    block_repeated_chars     INTEGER NOT NULL DEFAULT 1,
                    block_keyboard_patterns  INTEGER NOT NULL DEFAULT 1,
                    banned_words             TEXT    NOT NULL DEFAULT '',
                    force_change_first_login INTEGER NOT NULL DEFAULT 1,
                    force_change_admin_reset INTEGER NOT NULL DEFAULT 1,
                    min_change_interval_hours INTEGER NOT NULL DEFAULT 24,
                    show_strength_meter      INTEGER NOT NULL DEFAULT 1,
                    idle_minutes             INTEGER NOT NULL DEFAULT 30,
                    absolute_hours           INTEGER NOT NULL DEFAULT 12,
                    max_sessions             INTEGER NOT NULL DEFAULT 1,
                    notify_new_login         INTEGER NOT NULL DEFAULT 1,
                    auto_logout_admin        INTEGER NOT NULL DEFAULT 0,
                    logout_on_browser_close  INTEGER NOT NULL DEFAULT 1,
                    session_reissue_minutes  INTEGER NOT NULL DEFAULT 30,
                    concurrent_policy        TEXT    NOT NULL DEFAULT 'kill_oldest',
                    updated_at               TEXT,
                    updated_by               TEXT
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS security_policy_log (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    field_name  TEXT NOT NULL,
                    old_value   TEXT,
                    new_value   TEXT,
                    changed_by  TEXT,
                    changed_at  TEXT NOT NULL
                )
            """))
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS banned_passwords (
                    id   INTEGER PRIMARY KEY AUTOINCREMENT,
                    word VARCHAR(255) NOT NULL UNIQUE
                )
            """))
            db.session.commit()
            # 기본 행 시드
            _sp = db.session.execute(db.text("SELECT id FROM security_policy WHERE id=1")).fetchone()
            if not _sp:
                db.session.execute(db.text("INSERT INTO security_policy (id) VALUES (1)"))
                db.session.commit()
            # 기본 금칙어 시드
            _bw = db.session.execute(db.text("SELECT COUNT(*) FROM banned_passwords")).fetchone()
            if _bw and _bw[0] == 0:
                for _w in ['password','admin','welcome','qwerty','letmein','123456','abc123','master','root','login']:
                    try:
                        db.session.execute(db.text("INSERT IGNORE INTO banned_passwords (word) VALUES (:w)"), {'w': _w})
                    except Exception:
                        pass
                db.session.commit()
            # 마이그레이션: 기존 테이블에 새 컬럼 추가
            for _col, _def in [
                ('block_common_passwords', '1'), ('block_user_id', '1'), ('block_personal_info', '1'),
                ('block_sequential_chars', '1'), ('block_repeated_chars', '1'), ('block_keyboard_patterns', '1'),
                ('banned_words', "''"), ('force_change_first_login', '1'), ('force_change_admin_reset', '1'),
                ('min_change_interval_hours', '24'), ('show_strength_meter', '1'),
                ('logout_on_browser_close', '1'), ('session_reissue_minutes', '30'),
                ('concurrent_policy', "'kill_oldest'"), ('updated_by', "''"),
            ]:
                try:
                    _type = 'TEXT' if _def.startswith("'") else 'INTEGER'
                    db.session.execute(db.text(f"ALTER TABLE security_policy ADD COLUMN {_col} {_type} NOT NULL DEFAULT {_def}"))
                    db.session.commit()
                except Exception:
                    db.session.rollback()
            print('[security-policy] security_policy / security_policy_log / banned_passwords ready', flush=True)
        except Exception as sec_policy_init_err:
            try:
                print('[security-policy] table init failed:', sec_policy_init_err, flush=True)
            except Exception:
                pass

        # ── 활성 세션 테이블 (active_sessions) ──
        try:
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS active_sessions (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id  VARCHAR(255) NOT NULL UNIQUE,
                    emp_no      VARCHAR(64)  NOT NULL,
                    user_name   TEXT    NOT NULL DEFAULT '',
                    ip_address  TEXT,
                    user_agent  TEXT,
                    browser     TEXT,
                    os          TEXT,
                    created_at  TEXT    NOT NULL,
                    last_active TEXT    NOT NULL,
                    is_current  INTEGER NOT NULL DEFAULT 0
                )
            """))
            db.session.commit()
            # 마이그레이션: 누락 컬럼 보강
            for _col, _def in [('user_name', "''"), ('browser', "''"), ('os', "''"), ('is_current', '0')]:
                try:
                    _type = 'TEXT' if _def.startswith("'") else 'INTEGER'
                    db.session.execute(db.text(f"ALTER TABLE active_sessions ADD COLUMN {_col} {_type} NOT NULL DEFAULT {_def}"))
                    db.session.commit()
                except Exception:
                    db.session.rollback()
            print('[active-sessions] active_sessions table ready', flush=True)
        except Exception as _as_err:
            try:
                print('[active-sessions] table init failed:', _as_err, flush=True)
            except Exception:
                pass

        # ── 워크플로우 디자이너 테이블 (wf_design, wf_design_version, wf_design_like) ──
        try:
            from app.models import WfDesign, WfDesignVersion, WfDesignLike, WfDesignView  # noqa: F401
            from sqlalchemy import inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            existing = inspector.get_table_names()
            if 'wf_design' not in existing or 'wf_design_version' not in existing:
                WfDesign.__table__.create(db.engine, checkfirst=True)
                WfDesignVersion.__table__.create(db.engine, checkfirst=True)
                print('[wf-design] tables created', flush=True)
            if 'wf_design_like' not in existing:
                WfDesignLike.__table__.create(db.engine, checkfirst=True)
                print('[wf-design-like] table created', flush=True)
            if 'wf_design_view' not in existing:
                WfDesignView.__table__.create(db.engine, checkfirst=True)
                print('[wf-design-view] table created', flush=True)
            # save_type 컬럼 마이그레이션
            if 'wf_design_version' in existing:
                vcols = [c['name'] for c in inspector.get_columns('wf_design_version')]
                if 'save_type' not in vcols:
                    with db.engine.connect() as conn:
                        conn.execute(db.text("ALTER TABLE wf_design_version ADD COLUMN save_type VARCHAR(10) NOT NULL DEFAULT 'manual'"))
                        conn.commit()
                    print('[wf-design-version] save_type column added', flush=True)
            # shared / like_count 컬럼 마이그레이션
            if 'wf_design' in existing:
                cols = [c['name'] for c in inspector.get_columns('wf_design')]
                if 'shared' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(db.text("ALTER TABLE wf_design ADD COLUMN shared INTEGER NOT NULL DEFAULT 0"))
                        conn.commit()
                    print('[wf-design] shared column added', flush=True)
                if 'like_count' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(db.text("ALTER TABLE wf_design ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0"))
                        conn.commit()
                    print('[wf-design] like_count column added', flush=True)
                if 'view_count' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(db.text("ALTER TABLE wf_design ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0"))
                        conn.commit()
                    print('[wf-design] view_count column added', flush=True)
                if 'editing_user_id' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(db.text("ALTER TABLE wf_design ADD COLUMN editing_user_id INTEGER"))
                        conn.commit()
                    print('[wf-design] editing_user_id column added', flush=True)
                if 'editing_since' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(db.text("ALTER TABLE wf_design ADD COLUMN editing_since TEXT"))
                        conn.commit()
                    print('[wf-design] editing_since column added', flush=True)
                if 'live_definition' not in cols:
                    with db.engine.connect() as conn:
                        conn.execute(db.text("ALTER TABLE wf_design ADD COLUMN live_definition TEXT"))
                        conn.commit()
                    print('[wf-design] live_definition column added', flush=True)
        except Exception as wf_init_err:
            try:
                print('[wf-design] table init failed:', wf_init_err, flush=True)
            except Exception:
                pass

        # ── 워크플로우 댓글 테이블 (wf_design_comment) ──
        try:
            from app.models import WfDesignComment  # noqa: F401
            from sqlalchemy import inspect as sa_inspect
            inspector = sa_inspect(db.engine)
            existing = inspector.get_table_names()
            if 'wf_design_comment' not in existing:
                WfDesignComment.__table__.create(db.engine, checkfirst=True)
                print('[wf-design-comment] table created', flush=True)
        except Exception as wfc_init_err:
            try:
                print('[wf-design-comment] table init failed:', wfc_init_err, flush=True)
            except Exception:
                pass

        # ── 변경이력(change_event / change_diff) 테이블 ──
        try:
            from app.services.change_event_service import init_change_event_tables
            init_change_event_tables(app)
        except Exception as ce_init_err:
            try:
                print('[change-event] table init failed:', ce_init_err, flush=True)
            except Exception:
                pass

        # ── 알림(sys_notification) 테이블 ──
        try:
            from app.services.notification_service import init_notification_table
            init_notification_table(app)
        except Exception as noti_init_err:
            try:
                print('[notification] table init failed:', noti_init_err, flush=True)
            except Exception:
                pass

        # ── 인포메이션 문구(sys_info_message) 테이블 + 시드 ──
        try:
            from app.services.info_message_service import init_info_message_table, seed_info_messages
            init_info_message_table(app)
            seed_info_messages(app)
        except Exception as info_msg_err:
            try:
                print('[info-message] table init failed:', info_msg_err, flush=True)
            except Exception:
                pass

        try:
            init_page_tab_config_table(app)
        except Exception as page_tab_init_err:
            try:
                print('[page-tab-config] table init failed:', page_tab_init_err, flush=True)
            except Exception:
                pass

        try:
            init_brand_setting_table(app)
        except Exception as brand_init_err:
            try:
                print('[brand-setting] table init failed:', brand_init_err, flush=True)
            except Exception:
                pass


    # 블루프린트 등록
    from app.routes.main import main_bp
    from app.routes.pages import pages_bp
    from app.routes.api import api_bp
    from app.routes.rack_detail_api import rack_detail_api_bp
    from app.routes.auth import auth_bp
    from app.routes.hw_interface_api import hw_interface_api_bp
    from app.routes.hw_interface_detail_api import hw_interface_detail_api_bp
    from app.routes.hw_maintenance_contract_api import hw_maintenance_contract_api_bp
    from app.routes.hw_activate_api import hw_activate_api_bp
    from app.routes.hw_firewalld_api import hw_firewalld_api_bp
    from app.routes.hw_frame_frontbay_api import hw_frame_frontbay_api_bp
    from app.routes.hw_frame_rearbay_api import hw_frame_rearbay_api_bp
    from app.routes.tab14_change_log_api import change_log_api_bp
    from app.routes.change_event_api import change_event_api_bp
    from app.routes.sw_system_allocation_api import sw_system_allocation_api_bp
    from app.routes.tab32_assign_group_api import tab32_assign_group_api_bp
    from app.routes.notification_api import notification_api_bp
    from app.routes.sse_api import sse_bp
    from app.routes.agent_api import agent_api_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(agent_api_bp)
    app.register_blueprint(rack_detail_api_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(hw_interface_api_bp)
    app.register_blueprint(hw_interface_detail_api_bp)
    app.register_blueprint(hw_maintenance_contract_api_bp)
    app.register_blueprint(hw_activate_api_bp)
    app.register_blueprint(hw_firewalld_api_bp)
    app.register_blueprint(hw_frame_frontbay_api_bp)
    app.register_blueprint(hw_frame_rearbay_api_bp)
    app.register_blueprint(change_log_api_bp)
    app.register_blueprint(change_event_api_bp)
    app.register_blueprint(sw_system_allocation_api_bp)
    app.register_blueprint(tab32_assign_group_api_bp)
    app.register_blueprint(notification_api_bp)
    app.register_blueprint(sse_bp)


    # CLI 명령어 등록
    from app.cli import register_commands
    register_commands(app)
    
    # 주의: 테이블 자동 생성은 사용하지 않습니다. (Flask-Migrate 사용)
    # 마이그레이션 워크플로우: flask db init → flask db migrate → flask db upgrade
    
    # 404 에러 핸들러
    @app.errorhandler(404)
    def page_not_found(e):
        try:
            # API는 HTML 404 페이지 대신 JSON을 반환해야 프론트(fetch)에서 안정적으로 처리됩니다.
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'message': 'Not Found'}), 404
        except Exception:
            pass
        return render_template('error/pages-404.html'), 404
    
    # 403 에러 핸들러
    @app.errorhandler(403)
    def forbidden(e):
        if request.path.startswith('/api/'):
            return jsonify({'success': False, 'message': '접근이 거부되었습니다.'}), 403
        return render_template('error/pages-404.html'), 403

    # 405 에러 핸들러
    @app.errorhandler(405)
    def method_not_allowed(e):
        if request.path.startswith('/api/'):
            return jsonify({'success': False, 'message': '허용되지 않은 메서드입니다.'}), 405
        return render_template('error/pages-404.html'), 405

    # 422 에러 핸들러
    @app.errorhandler(422)
    def unprocessable_entity(e):
        if request.path.startswith('/api/'):
            return jsonify({'success': False, 'message': '요청을 처리할 수 없습니다.'}), 422
        return render_template('error/pages-404.html'), 422

    # 500 에러 핸들러 — 내부 정보 노출 방지
    @app.errorhandler(500)
    def internal_server_error(e):
        import logging as _log
        _log.getLogger(__name__).exception('[500] 내부 서버 오류 path=%s', request.path)
        if request.path.startswith('/api/'):
            return jsonify({'success': False, 'message': '처리 중 오류가 발생했습니다.'}), 500
        try:
            return render_template('error/pages-500.html'), 500
        except Exception:
            return '처리 중 오류가 발생했습니다.', 500
    
    # 헬스체크 엔드포인트 (서버 + DB 연결 확인)
    @app.route('/health')
    def health():
        result = {'status': 'ok'}
        try:
            db.session.execute(db.text('SELECT 1'))
        except Exception as exc:
            result['status'] = 'degraded'
            result['db'] = str(type(exc).__name__)
            return result, 503
        return result, 200

    # 요청 진단: /login 접근 시 사전(before_request) 훅으로 실제 실행 여부와 메소드 로깅
    @app.before_request
    def _debug_login_probe():
        # 너무 많은 로그 방지: /login 경로만 추적
        if request.path == '/login':
            try:
                print('[login_debug] BEFORE_REQUEST path=/login method=', request.method, 'blueprint=', request.blueprint, flush=True)
            except Exception:
                pass
            # 파일 로깅도 시도 (콘솔 미표시 환경 대비)
            try:
                inst = app.instance_path
                os.makedirs(inst, exist_ok=True)
                with open(os.path.join(inst, 'login_debug.log'), 'a', encoding='utf-8') as f:
                    f.write(f"[login_debug_pre] method={request.method} path=/login blueprint={request.blueprint}\n")
            except Exception:
                pass

    # 라우트 맵 덤프 (실행 중 어떤 /login 엔드포인트가 등록됐는지 확인용)
    @app.route('/debug/routes')
    @app.route('/debug/routes/')
    @app.route('/__routes')
    @app.route('/__routes/')
    def debug_routes():
        # 라우트가 실제 등록됐는지 즉시 확인, 첫 호출 시 콘솔 출력
        try:
            print('[debug_routes] invoked', flush=True)
        except Exception:
            pass
        rules = []
        for rule in app.url_map.iter_rules():
            rules.append({
                'rule': str(rule),
                'endpoint': rule.endpoint,
                'methods': sorted(list(rule.methods))
            })
        return jsonify({'count': len(rules), 'rules': rules})

    # 매우 단순한 즉시 확인용 핑 라우트 (브라우저 404 원인 추적)
    @app.route('/__diag__ping')
    def __diag_ping():
        try:
            print('[__diag__ping] reached', flush=True)
        except Exception:
            pass
        # 파일에도 흔적 남기기
        try:
            inst = app.instance_path
            os.makedirs(inst, exist_ok=True)
            with open(os.path.join(inst, 'diag_trace.log'), 'a', encoding='utf-8') as f:
                f.write('[__diag__ping]\n')
        except Exception:
            pass
        return 'PING', 200

    def _diag_local_only() -> bool:
        try:
            if not app.config.get('DEBUG'):
                return False
            ra = (request.remote_addr or '').strip()
            return ra in ('127.0.0.1', '::1')
        except Exception:
            return False

    @app.route('/__diag__/dbinfo')
    def __diag_dbinfo():
        if not _diag_local_only():
            return jsonify({'success': False, 'message': 'forbidden'}), 403
        try:
            engine = db.get_engine()
            url = str(engine.url)
        except Exception as exc:
            url = None
            try:
                print('[__diag__/dbinfo] engine url error:', exc, flush=True)
            except Exception:
                pass
        api_file = None
        try:
            from app.routes import api as _api_routes  # pylint: disable=import-outside-toplevel

            api_file = getattr(_api_routes, '__file__', None)
        except Exception:
            api_file = None

        has_prj = False
        try:
            has_prj = any(r.rule == '/api/prj/projects' for r in app.url_map.iter_rules())
        except Exception:
            has_prj = False

        return jsonify({
            'success': True,
            'debug': bool(app.config.get('DEBUG')),
            'sqlalchemy_database_uri': app.config.get('SQLALCHEMY_DATABASE_URI'),
            'engine_url': url,
            'instance_path': app.instance_path,
            'cwd': os.getcwd(),
            'api_module_file': api_file,
            'has_prj_projects_route': bool(has_prj),
        })

    @app.route('/__diag__/calendar/<int:schedule_id>')
    def __diag_calendar_schedule(schedule_id: int):
        if not _diag_local_only():
            return jsonify({'success': False, 'message': 'forbidden'}), 403
        try:
            from app.models import CalSchedule, UserProfile  # pylint: disable=import-outside-toplevel
            from app.routes import api as _api_routes  # pylint: disable=import-outside-toplevel

            schedule = CalSchedule.query.filter_by(id=schedule_id).first()
            if not schedule:
                return jsonify({'success': True, 'found': False, 'schedule_id': schedule_id})
            owner = UserProfile.query.get(schedule.owner_user_id) if schedule.owner_user_id else None
            serialized = _api_routes._serialize_calendar_schedule(schedule, actor_user_id=schedule.owner_user_id, actor_profile=owner)
            return jsonify({
                'success': True,
                'found': True,
                'schedule_id': schedule_id,
                'owner_user_id': schedule.owner_user_id,
                'owner_profile_image_db': getattr(owner, 'profile_image', None) if owner else None,
                'serialized_owner': (serialized.get('owner') or None),
            })
        except Exception as exc:
            try:
                print('[__diag__/calendar] error:', exc, flush=True)
                traceback.print_exc()
            except Exception:
                pass
            return jsonify({'success': False, 'message': 'error'}), 500

    # 캐치올 진단 라우트: /__diag__/catch/<path>
    @app.route('/__diag__/catch/<path:rest>')
    def __diag_catch(rest):
        # Provide a couple of structured diagnostics via the already-registered catch route.
        # (Some environments may not register the dedicated /__diag__/dbinfo endpoints reliably.)
        if rest == 'dbinfo':
            if not _diag_local_only():
                return jsonify({'success': False, 'message': 'forbidden'}), 403
            try:
                engine = db.get_engine()
                url = str(engine.url)
            except Exception as exc:
                url = None
                try:
                    print('[__diag__/catch/dbinfo] engine url error:', exc, flush=True)
                except Exception:
                    pass
            api_file = None
            try:
                from app.routes import api as _api_routes  # pylint: disable=import-outside-toplevel

                api_file = getattr(_api_routes, '__file__', None)
            except Exception:
                api_file = None

            has_prj = False
            try:
                has_prj = any(r.rule == '/api/prj/projects' for r in app.url_map.iter_rules())
            except Exception:
                has_prj = False

            return jsonify({
                'success': True,
                'debug': bool(app.config.get('DEBUG')),
                'sqlalchemy_database_uri': app.config.get('SQLALCHEMY_DATABASE_URI'),
                'engine_url': url,
                'instance_path': app.instance_path,
                'cwd': os.getcwd(),
                'api_module_file': api_file,
                'has_prj_projects_route': bool(has_prj),
            })

        if rest.startswith('calendar/'):
            if not _diag_local_only():
                return jsonify({'success': False, 'message': 'forbidden'}), 403
            try:
                raw_id = rest.split('/', 1)[1]
                schedule_id = int(raw_id)
            except Exception:
                return jsonify({'success': False, 'message': 'invalid id'}), 400
            try:
                from app.models import CalSchedule, UserProfile  # pylint: disable=import-outside-toplevel
                from app.routes import api as _api_routes  # pylint: disable=import-outside-toplevel

                schedule = CalSchedule.query.filter_by(id=schedule_id).first()
                if not schedule:
                    return jsonify({'success': True, 'found': False, 'schedule_id': schedule_id})
                owner = UserProfile.query.get(schedule.owner_user_id) if schedule.owner_user_id else None
                serialized = _api_routes._serialize_calendar_schedule(schedule, actor_user_id=schedule.owner_user_id, actor_profile=owner)
                return jsonify({
                    'success': True,
                    'found': True,
                    'schedule_id': schedule_id,
                    'owner_user_id': schedule.owner_user_id,
                    'owner_profile_image_db': getattr(owner, 'profile_image', None) if owner else None,
                    'serialized_owner': (serialized.get('owner') or None),
                })
            except Exception as exc:
                try:
                    print('[__diag__/catch/calendar] error:', exc, flush=True)
                    traceback.print_exc()
                except Exception:
                    pass
                return jsonify({'success': False, 'message': 'error'}), 500

        try:
            print('[__diag__catch] path=', rest, flush=True)
        except Exception:
            pass
        try:
            inst = app.instance_path
            os.makedirs(inst, exist_ok=True)
            with open(os.path.join(inst, 'diag_trace.log'), 'a', encoding='utf-8') as f:
                f.write(f"[__diag__catch] {rest}\n")
        except Exception:
            pass
        return jsonify({'diag': 'catch', 'path': rest})

    # 모든 요청 경로 1행 로깅(임시). 너무 많으면 조건 줄이기.
    @app.before_request
    def _trace_all_paths():
        # 이미 /login 로깅 있으니 유지, 여기서는 /debug, /__ 만 추가
        p = request.path
        if p.startswith('/debug') or p.startswith('/__') or p.startswith('/__diag'):
            try:
                print('[path_trace] incoming path=', p, 'method=', request.method, flush=True)
            except Exception:
                pass
            # 파일에도 저장 (확실한 흔적 확보)
            try:
                inst = app.instance_path
                os.makedirs(inst, exist_ok=True)
                with open(os.path.join(inst, 'diag_trace.log'), 'a', encoding='utf-8') as f:
                    f.write(f"[path_trace] {p} {request.method}\n")
            except Exception:
                pass

    # 앱 생성 직후 등록된 /login 라우트 존재 여부 1회 출력
    try:
        # 전체 라우트 간단 요약 출력 (최소 1회)
        all_rules = list(app.url_map.iter_rules())
        login_rules = [r for r in all_rules if str(r) == '/login']
        debug_rules = [r for r in all_rules if '/debug/routes' in str(r) or '/__routes' in str(r)]
        summarized = [(str(r), r.endpoint) for r in all_rules[:15]]  # 너무 길면 앞 15개만
        print('[startup_debug] total_rules=', len(all_rules), 'sample=', summarized, flush=True)
        print('[startup_debug] /login rules count=', len(login_rules), 'details=', [(r.endpoint, sorted(list(r.methods))) for r in login_rules], flush=True)
        print('[startup_debug] debug_routes present count=', len(debug_rules), 'debug_rules=', [(str(r), r.endpoint) for r in debug_rules], flush=True)
    except Exception as e:
        print('[startup_debug] rule_enumeration_error', e, flush=True)

    # 정적파일 캐시 방지 (개발 환경)
    if app.config.get('DEBUG'):
        app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
        app.jinja_env.cache = {}  # 템플릿 캐시 비우기

    # 사이드바 권한 컨텍스트 주입 (메뉴 기반 권한)
    from app.models import AuthRole
    from app.services.permission_service import MENU_SEEDS as _PERM_MENU_SEEDS
    import json as _json

    # ── 세션 유휴/절대 만료 체크 (before_request) ──
    @app.before_request
    def _check_session_expiry():
        """보안정책의 idle_minutes / absolute_hours 에 따라 세션을 강제 만료한다."""
        if 'user_id' not in session:
            return None
        # 정적 파일 요청은 세션 체크 제외
        if request.path.startswith('/static/'):
            return None
        # 로그인/로그아웃 경로는 세션 체크 제외 (무한 리다이렉트 방지)
        if request.path in ('/login', '/logout'):
            return None
        now = datetime.utcnow()
        # ── _login_at 이 없는 구버전 세션은 강제 만료 ──
        login_at_raw = session.get('_login_at')
        if not login_at_raw:
            session.clear()
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'success': False, 'error': 'session_expired', 'message': '세션이 만료되었습니다. 다시 로그인 해주세요.'}), 401
            return redirect(url_for('auth.login'))
        # ── 유휴 시간 체크 ──
        last_active = session.get('_last_active')
        if last_active:
            try:
                if isinstance(last_active, str):
                    last_active = datetime.fromisoformat(last_active)
                idle_limit = 30  # 기본값
                try:
                    row = db.session.execute(
                        db.text("SELECT idle_minutes FROM security_policy WHERE id=1")
                    ).fetchone()
                    if row and row[0]:
                        idle_limit = int(row[0])
                except Exception:
                    pass
                if (now - last_active).total_seconds() > idle_limit * 60:
                    session.clear()
                    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                        return jsonify({'success': False, 'error': 'session_expired', 'message': '세션이 만료되었습니다. 다시 로그인 해주세요.'}), 401
                    return redirect(url_for('auth.login'))
            except Exception:
                pass
        # ── 절대 만료 시간 체크 ──
        login_at = session.get('_login_at')
        if login_at:
            try:
                if isinstance(login_at, str):
                    login_at = datetime.fromisoformat(login_at)
                abs_limit = 12  # 기본 시간
                try:
                    row = db.session.execute(
                        db.text("SELECT absolute_hours FROM security_policy WHERE id=1")
                    ).fetchone()
                    if row and row[0]:
                        abs_limit = int(row[0])
                except Exception:
                    pass
                if (now - login_at).total_seconds() > abs_limit * 3600:
                    session.clear()
                    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                        return jsonify({'success': False, 'error': 'session_expired', 'message': '세션이 만료되었습니다. 다시 로그인 해주세요.'}), 401
                    return redirect(url_for('auth.login'))
            except Exception:
                pass
        # 활동 시간 갱신
        session['_last_active'] = now.isoformat()

    # ── 권한 체크 미들웨어 (before_request) ──
    @app.before_request
    def check_screen_permission():
        """메뉴 기반 화면 권한 미들웨어. NONE → 403, READ + 쓰기 메서드 → 403."""
        import flask as _fl
        from app.services.permission_service import check_permission as _check_perm
        path = _fl.request.path
        if 'user_id' not in session:
            return None
        if (session.get('role') or '').upper() == 'ADMIN':
            return None
        perm_cache = session.get('_perms')
        result = _check_perm(path, _fl.request.method, perm_cache)
        if result == 'forbidden':
            # API 요청은 JSON 403, 페이지 요청은 대시보드로 리다이렉트
            if path.startswith('/api/'):
                return _fl.jsonify({'success': False, 'error': 'forbidden', 'message': '접근 권한이 없습니다.'}), 403
            return _fl.redirect('/')
        if result == 'readonly':
            return _fl.jsonify({'success': False, 'error': 'readonly', 'message': '읽기 전용 권한입니다. 데이터 변경이 불가합니다.'}), 403
        return None

    @app.context_processor
    def inject_sidebar_permissions():
        # 자동 ADMIN 승격 확장:
        # - 세션 role != ADMIN 인 상태에서 user_id 로 조회한 AuthUser 가 ADMIN 인 경우
        # - 또는 emp_no 자체가 ADMIN (대소문자 무시)
        # - 또는 email prefix 가 ADMIN
        # 승격 시 DB role 도 ADMIN 으로 교정 (불변 보장)
        try:
            _sess_role = session.get('role') or ''
            _uid = session.get('user_id')
            _emp = (session.get('emp_no') or '').strip()
            if (_uid or _emp) and _sess_role.upper() != 'ADMIN':
                from app.models import AuthUser as _AU
                u = None
                if _uid:
                    u = _AU.query.filter_by(id=_uid).first()
                elif _emp:
                    u = _AU.query.filter_by(emp_no=_emp).first()
                if u:
                    _email_prefix = (u.email.split('@')[0] if u.email else '').upper()
                    if (u.role and u.role.upper() == 'ADMIN') or (_emp.upper() == 'ADMIN') or (_email_prefix == 'ADMIN'):
                        if not u.role or u.role.upper() != 'ADMIN':
                            try:
                                u.role = 'ADMIN'
                                db.session.commit()
                                from app.security import log_audit_event
                                log_audit_event(
                                    'ADMIN_ESCALATION',
                                    f'사이드바 렌더링 시 ADMIN 자동 승격: emp_no={u.emp_no}',
                                    emp_no=u.emp_no or _emp,
                                    details=f'trigger=sidebar_context_processor'
                                )
                            except Exception as _se:
                                db.session.rollback()
                        session['role'] = 'ADMIN'
                        _sess_role = 'ADMIN'
        except Exception as _esc_e:
            print('[sidebar_escalation] exception', _esc_e, flush=True)
        role = session.get('role')
        perms = {}
        # 새 메뉴 기반 권한 시스템: 세션 캐시 → effective 권한 → 사이드바 dict
        _perm_cache = session.get('_perms') or {}
        # ADMIN 은 전체 WRITE
        if (session.get('role') or '').upper() == 'ADMIN':
            _perm_cache = {code: 'WRITE' for code, _, _, _ in _PERM_MENU_SEEDS}
            _perm_cache['settings'] = 'WRITE'
        # 세션 캐시를 사이드바용 dict 로 변환
        # 사이드바는 legacy format {section: {read: bool, write: bool}} 사용
        for _code, _level in _perm_cache.items():
            _section = _code.split('.')[0]  # 대분류 기준
            _r = _level in ('READ', 'WRITE')
            _w = _level == 'WRITE'
            if _section not in perms:
                perms[_section] = {'read': _r, 'write': _w}
            else:
                perms[_section]['read'] = perms[_section].get('read', False) or _r
                perms[_section]['write'] = perms[_section].get('write', False) or _w
        # ADMIN settings 보강
        if (session.get('role') or '').upper() == 'ADMIN':
            perms.setdefault('settings', {'read': True, 'write': True})
        # 현재 로그인 사용자 기본 정보 + 프로필 이미지(확장 프로필 테이블) 주입
        # 통일된 기본 이미지 (실제 존재하는 경로: svg/profil)
        current_profile_image = '/static/image/svg/profil/free-icon-bussiness-man.svg'
        current_user_name = None
        current_emp_no = session.get('emp_no')
        current_user_role = session.get('role','')
        current_user_profile_id = None
        current_user_department = None
        try:
            if current_emp_no:
                from app.models import AuthUser, UserProfile
                prof = UserProfile.query.filter(UserProfile.emp_no.ilike(current_emp_no)).first()
                au = None
                if not prof:
                    au = AuthUser.query.filter(AuthUser.emp_no.ilike(current_emp_no)).first()
                    if au:
                        generated_name = au.emp_no or (au.email.split('@')[0] if au.email else None)
                        default_department = '미지정'
                        prof = UserProfile(
                            emp_no=au.emp_no,
                            name=generated_name,
                            email=au.email,
                            department=default_department,
                        )
                        db.session.add(prof)
                        try:
                            db.session.commit()
                        except Exception as auto_profile_err:
                            db.session.rollback()
                            prof = None
                            print('[header_profile_inject] failed to auto-create UserProfile', auto_profile_err, flush=True)
                if prof:
                    if prof.profile_image:
                        current_profile_image = prof.profile_image
                    current_user_name = prof.name or None
                    current_user_profile_id = prof.id
                    current_user_department = prof.department or None
                else:
                    # fallback: auth_users 테이블 일부 정보
                    if not au:
                        au = AuthUser.query.filter(AuthUser.emp_no.ilike(current_emp_no)).first()
                    if au:
                        current_user_name = au.emp_no  # 이름 없을 때 사번 표시용
        except Exception as _profile_e:
            print('[header_profile_inject] exception', _profile_e, flush=True)
        # 템플릿 추가 변수
        return {
            'sidebar_perms': perms,
            'session_role_debug': session.get('role',''),
            'current_profile_image': current_profile_image,
            'current_user_name': current_user_name,
            'current_emp_no': current_emp_no,
            'current_user_emp_no': current_emp_no,
            'current_user_role': current_user_role,
            'current_user_profile_id': current_user_profile_id,
            'current_user_department': current_user_department,
        }

    # 최종 보강: 역할 목록 라우트 없으면 무조건 등록 (이미 있어도 중복 회피)
    try:
        current_rules = {str(r) for r in app.url_map.iter_rules()}
        if '/admin/auth/groups/list' not in current_rules:
            from app.models import Role, RoleUser
            import sqlalchemy as sa
            from flask import session as _session, jsonify as _jsonify
            def _final_role_list():
                if 'role' not in _session or _session.get('role') not in ('admin','ADMIN','관리자'):
                    return _jsonify({'error':'unauthorized'}), 403
                try:
                    rows = (
                        db.session.query(Role, sa.func.count(RoleUser.user_id).label('uc'))
                        .outerjoin(RoleUser, Role.id == RoleUser.role_id)
                        .group_by(Role.id)
                        .order_by(Role.id.asc())
                        .all()
                    )
                except Exception as e:
                    return _jsonify({'error':'db_query_failed','detail':str(e)}), 500
                roles = []
                for r, uc in rows:
                    roles.append({
                        'id': r.id,
                        'name': r.name,
                        'description': r.description,
                        'user_count': uc,
                        'permissions': {
                            'dashboard': {'read': r.dashboard_read, 'write': r.dashboard_write},
                            'hardware': {'read': r.hardware_read, 'write': r.hardware_write},
                            'software': {'read': r.software_read, 'write': r.software_write},
                            'governance': {'read': r.governance_read, 'write': r.governance_write},
                            'datacenter': {'read': r.datacenter_read, 'write': r.datacenter_write},
                            'cost': {'read': r.cost_read, 'write': r.cost_write},
                            'project': {'read': r.project_read, 'write': r.project_write},
                            'category': {'read': r.category_read, 'write': r.category_write},
                        }
                    })
                return _jsonify({'roles': roles, 'count': len(roles)})
            app.add_url_rule('/admin/auth/groups/list', endpoint='auth.admin_groups_list.final', view_func=_final_role_list, methods=['GET'])
            app.add_url_rule('/admin/auth/groups/list2', endpoint='auth.admin_groups_list_compat.final', view_func=_final_role_list, methods=['GET'])
            print('[final-patch] role list routes registered', flush=True)
        else:
            print('[final-patch] role list routes already present', flush=True)
    except Exception as e:
        print('[final-patch] role list registration failed:', e, flush=True)

    # ── wrk_report: cancel_reason 컬럼 마이그레이션 ──
    try:
        with app.app_context():
            db.session.execute(db.text("ALTER TABLE wrk_report ADD COLUMN cancel_reason TEXT"))
            db.session.commit()
            print('[wrk-report] added cancel_reason column', flush=True)
    except Exception:
        try:
            with app.app_context():
                db.session.rollback()
        except Exception:
            pass  # 이미 존재하면 무시

    # ── wrk_report_user_clear 테이블 생성 (per-user 비우기) ──
    try:
        with app.app_context():
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS wrk_report_user_clear (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    report_id INTEGER NOT NULL REFERENCES wrk_report(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES org_user(id) ON DELETE CASCADE,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_wrk_report_user_clear_report_user UNIQUE (report_id, user_id)
                )
            """))
            db.session.execute(db.text("CREATE INDEX IF NOT EXISTS ix_wrk_report_user_clear_report_id ON wrk_report_user_clear(report_id)"))
            db.session.execute(db.text("CREATE INDEX IF NOT EXISTS ix_wrk_report_user_clear_user_id ON wrk_report_user_clear(user_id)"))
            db.session.commit()
            print('[wrk-report] wrk_report_user_clear table ready', flush=True)
    except Exception as e:
        try:
            with app.app_context():
                db.session.rollback()
        except Exception:
            pass
        print('[wrk-report] wrk_report_user_clear migration error:', e, flush=True)

    # ── RAG 인덱스 백그라운드 워커 시작 ──────────────────────────────────────
    _start_rag_background_worker(app)

    return app


def _start_rag_background_worker(app) -> None:
    """RAG 인덱스 잡 큐를 주기적으로 처리하는 데몬 스레드를 시작합니다.

    - 앱 시작 시 한 번만 실행 (이미 실행 중이면 skip)
    - 10초 간격으로 rag_index_jobs 의 pending 잡을 처리
    - 처리할 잡이 없으면 sleep 후 재시도만 반복
    """
    import os
    import threading
    import time

    _WORKER_INTERVAL = 10   # 초
    _MAX_JOBS_PER_RUN = 20

    # 동일 프로세스에서 중복 실행 방지
    if getattr(app, '_rag_worker_started', False):
        return
    app._rag_worker_started = True

    def _worker_loop():
        rag_db_path = os.path.join(app.instance_path, 'rag_index.db')
        while True:
            try:
                if os.path.exists(rag_db_path):
                    import sys
                    _scripts_dir = os.path.join(app.root_path, '..', 'scripts', 'ai_briefing')
                    _scripts_dir = os.path.abspath(_scripts_dir)
                    if _scripts_dir not in sys.path:
                        sys.path.insert(0, _scripts_dir)
                    from rag_index_worker import RagIndexWorker  # type: ignore
                    worker = RagIndexWorker(rag_db_path)
                    worker.run_until_empty(max_jobs=_MAX_JOBS_PER_RUN)
                    worker.close()
            except Exception:
                pass  # 로그만 남기고 계속 실행
            time.sleep(_WORKER_INTERVAL)

    t = threading.Thread(target=_worker_loop, name='rag-index-worker', daemon=True)
    t.start()
    print('[rag] background worker started (interval=10s)', flush=True)
