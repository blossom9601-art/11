from __future__ import annotations

from flask import Blueprint, render_template, abort, request, redirect, url_for, session
import os


def _template_exists(template_path: str) -> bool:
    """Best-effort check for a Jinja template file on disk.

    Flask's loader ultimately resolves templates under app/templates.
    We use this to support safe fallbacks during template renames.
    """
    try:
        templates_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'templates'))
        abs_path = os.path.normpath(os.path.join(templates_root, template_path.replace('/', os.sep)))
        return os.path.exists(abs_path)
    except Exception:
        return False


def _resolve_template(template_entry):
    if isinstance(template_entry, (list, tuple)):
        for candidate in template_entry:
            if candidate and _template_exists(candidate):
                return candidate
        return None
    return template_entry

from app.services.work_category_service import list_work_categories
from app.services.work_division_service import list_work_divisions
from app.services.work_status_service import list_work_statuses
from app.services.work_operation_service import list_work_operations
from app.services.work_group_service import list_work_groups, get_work_group as _svc_get_work_group
from app.services.sw_db_type_service import get_sw_db_type
from app.services.sw_os_type_service import get_sw_os_type
from app.services.sw_middleware_type_service import get_sw_middleware_type
from app.services.sw_virtual_type_service import get_sw_virtual_type
from app.services.sw_security_type_service import get_sw_security_type
from app.services.sw_high_availability_type_service import get_sw_ha_type
from app.services.vendor_manufacturer_service import get_vendor_by_code, get_vendor as svc_get_manufacturer_vendor
from app.services.vendor_maintenance_service import get_maintenance_vendor as svc_get_maintenance_vendor
from app.services.hardware_asset_service import get_hardware_asset as svc_get_hardware_asset
from app.services.hw_server_type_service import get_hw_server_type as _svc_get_hw_server
from app.services.hw_storage_type_service import get_hw_storage_type as _svc_get_hw_storage
from app.services.hw_san_type_service import get_hw_san_type as _svc_get_hw_san
from app.services.hw_network_type_service import get_hw_network_type as _svc_get_hw_network
from app.services.hw_security_type_service import get_hw_security_type as _svc_get_hw_security
from app.services.customer_member_service import get_customer_member as _svc_get_customer_member
from app.services.customer_associate_service import get_customer_associate as _svc_get_customer_associate
from app.services.customer_client_service import get_customer_client as _svc_get_customer_client
from app.models import NetVpnLine, NetLeasedLine, PageTabConfig

pages_bp = Blueprint('pages', __name__)

# page key → menu_code (화면권한 시스템 연동)
_KEY_MENU_CODE = {
    'dashboard': 'dashboard',
    'hw_server': 'system.server', 'hw_storage': 'system.storage', 'hw_san': 'system.san',
    'hw_network': 'system.network', 'hw_security': 'system.security',
    'access_control': 'access_control',
    'access_control_status': 'access_control.status',
    'access_control_access': 'access_control.access',
    'access_control_request': 'access_control.request',
    'access_control_audit': 'access_control.audit',
    'access_control_delegation': 'access_control.delegation',
    'gov_backup': 'governance.backup', 'gov_package': 'governance.package',
    'gov_vulnerability': 'governance.vulnerability', 'gov_ip': 'governance.ip',
    'gov_vpn': 'governance.vpn', 'gov_leased': 'governance.leased_line',
    'gov_unused': 'governance.unused_asset',
    'datacenter_access': 'datacenter.access', 'datacenter_rack': 'datacenter.rack',
    'dc_rack': 'datacenter.rack',
    'datacenter_temp': 'datacenter.temperature', 'datacenter_cctv': 'datacenter.cctv',
    'dc_thermo': 'datacenter.temperature', 'dc_cctv': 'datacenter.cctv',
    'cost_opex': 'cost.opex', 'cost_capex': 'cost.capex',
    'project': 'project',
    'insight_technical': 'insight.technical', 'insight_blog': 'insight.blog',
    'insight': 'insight',
    'category_business': 'category.business', 'category_hardware': 'category.hardware',
    'category_software': 'category.software', 'category_component': 'category.component',
    'cat_hw_dashboard': 'category.hardware', 'cat_hw': 'category.hardware',
    'cat_sw_dashboard': 'category.software', 'cat_sw': 'category.software',
    'category_company': 'category.company', 'cat_company_company': 'category.company', 'cat_company_department': 'category.company', 'cat_company_center': 'category.company', 'category_customer': 'category.customer',
    'category_vendor': 'category.vendor',
    'admin_user': 'settings.user', 'admin_role': 'settings.permission',
    'admin_auth': 'settings.auth', 'admin_security': 'settings.security',
    'admin_mail': 'settings.mail', 'admin_quality': 'settings.quality',
    'admin_log': 'settings.log', 'admin_access_control': 'settings.access_control',
}


def _resolve_menu_code(key):
    """page key → menu_code를 최장 접두사 매칭으로 결정"""
    if key in _KEY_MENU_CODE:
        return _KEY_MENU_CODE[key]
    # 접두사 매칭: hw_server_onpremise_detail → system.server
    parts = key.split('_')
    for n in range(len(parts), 0, -1):
        prefix = '_'.join(parts[:n])
        if prefix in _KEY_MENU_CODE:
            return _KEY_MENU_CODE[prefix]
    return None

# 화이트리스트: key -> template 경로
TEMPLATE_MAP = {
    'dashboard': '1.dashboard/1.dashboard.html',
    # Insight
    'insight_trend': '5.insight/5-1.insight/5-1-1.trend/1.trend_list.html',
    'insight_security': '5.insight/5-1.insight/5-1-2.security/1.security_list.html',
    'insight_report': '5.insight/5-1.insight/5-1-3.report/1.report_list.html',
    'insight_technical': '5.insight/5-1.insight/5-1-4.technical/1.technical_list.html',
    # Blog
    'insight_blog_it': '5.insight/5-2.blog/5-2-1.it_blog/1.blog_list.html',
    'insight_blog_it_detail': '5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html',
    # Hardware
    'hw_server_onpremise': '2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.html',
    'hw_server_onpremise_detail': '2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.html',
    'hw_server_onpremise_hw': '2.hardware/2-1.server/2-1-1.onpremise/tab01-hardware.html',
    'hw_server_onpremise_sw': '2.hardware/2-1.server/2-1-1.onpremise/tab02-software.html',
    'hw_server_onpremise_backup': '2.hardware/2-1.server/2-1-1.onpremise/tab03-backup.html',
    'hw_server_onpremise_if': '2.hardware/2-1.server/2-1-1.onpremise/tab04-interface.html',
    'hw_server_onpremise_account': '2.hardware/2-1.server/2-1-1.onpremise/tab05-account.html',
    'hw_server_onpremise_authority': '2.hardware/2-1.server/2-1-1.onpremise/tab06-authority.html',
    'hw_server_onpremise_activate': '2.hardware/2-1.server/2-1-1.onpremise/tab07-activate.html',
    'hw_server_onpremise_firewalld': 'layouts/tab08-firewalld-shared.html',
    'hw_server_onpremise_storage': 'layouts/tab10-storage-shared.html',
    'hw_server_onpremise_task': '2.hardware/2-1.server/2-1-1.onpremise/tab11-task.html',
    'hw_server_onpremise_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_server_onpremise_package': '2.hardware/2-1.server/2-1-1.onpremise/tab13-package.html',
    'hw_server_onpremise_log': '2.hardware/2-1.server/2-1-1.onpremise/tab14-log.html',
    'hw_server_onpremise_file': '2.hardware/2-1.server/2-1-1.onpremise/tab15-file.html',
    'hw_server_cloud': '2.hardware/2-1.server/2-1-2.cloud/1.cloud_list.html',
    'hw_server_cloud_detail': '2.hardware/2-1.server/2-1-2.cloud/2.cloud_detail.html',
    'hw_server_cloud_hw': '2.hardware/2-1.server/2-1-2.cloud/tab01-hardware.html',
    'hw_server_cloud_sw': '2.hardware/2-1.server/2-1-2.cloud/tab02-software.html',
    'hw_server_cloud_backup': '2.hardware/2-1.server/2-1-2.cloud/tab03-backup.html',
    'hw_server_cloud_if': '2.hardware/2-1.server/2-1-2.cloud/tab04-interface.html',
    'hw_server_cloud_account': '2.hardware/2-1.server/2-1-2.cloud/tab05-account.html',
    'hw_server_cloud_authority': '2.hardware/2-1.server/2-1-2.cloud/tab06-authority.html',
    'hw_server_cloud_activate': '2.hardware/2-1.server/2-1-2.cloud/tab07-activate.html',
    'hw_server_cloud_firewalld': 'layouts/tab08-firewalld-shared.html',
    'hw_server_cloud_storage': 'layouts/tab10-storage-shared.html',
    'hw_server_cloud_task': '2.hardware/2-1.server/2-1-2.cloud/tab11-task.html',
    'hw_server_cloud_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_server_cloud_package': '2.hardware/2-1.server/2-1-2.cloud/tab13-package.html',
    'hw_server_cloud_log': '2.hardware/2-1.server/2-1-2.cloud/tab14-log.html',
    'hw_server_cloud_file': '2.hardware/2-1.server/2-1-2.cloud/tab15-file.html',
    'hw_server_frame': '2.hardware/2-1.server/2-1-3.frame/1.frame_list.html',
    'hw_server_frame_detail': '2.hardware/2-1.server/2-1-3.frame/2.frame_detail.html',
    'hw_server_frame_frontbay': 'layouts/tab21-frontbay-shared.html',
    'hw_server_frame_rearbay': 'layouts/tab22-rearbay-shared.html',
    'hw_server_frame_if': '2.hardware/2-1.server/2-1-3.frame/tab04-interface.html',
    'hw_server_frame_account': '2.hardware/2-1.server/2-1-3.frame/tab05-account.html',
    'hw_server_frame_task': '2.hardware/2-1.server/2-1-3.frame/tab11-task.html',
    'hw_server_frame_log': '2.hardware/2-1.server/2-1-3.frame/tab14-log.html',
    'hw_server_frame_file': '2.hardware/2-1.server/2-1-3.frame/tab15-file.html',
    'hw_server_workstation': '2.hardware/2-1.server/2-1-4.workstation/1.workstation_list.html',
    'hw_server_workstation_detail': '2.hardware/2-1.server/2-1-4.workstation/2.workstation_detail.html',
    'hw_server_workstation_hw': '2.hardware/2-1.server/2-1-4.workstation/tab01-hardware.html',
    'hw_server_workstation_sw': '2.hardware/2-1.server/2-1-4.workstation/tab02-software.html',
    'hw_server_workstation_backup': '2.hardware/2-1.server/2-1-4.workstation/tab03-backup.html',
    'hw_server_workstation_if': '2.hardware/2-1.server/2-1-4.workstation/tab04-interface.html',
    'hw_server_workstation_account': '2.hardware/2-1.server/2-1-4.workstation/tab05-account.html',
    'hw_server_workstation_authority': '2.hardware/2-1.server/2-1-4.workstation/tab06-authority.html',
    'hw_server_workstation_activate': '2.hardware/2-1.server/2-1-4.workstation/tab07-activate.html',
    'hw_server_workstation_firewalld': 'layouts/tab08-firewalld-shared.html',
    'hw_server_workstation_storage': 'layouts/tab10-storage-shared.html',
    'hw_server_workstation_task': '2.hardware/2-1.server/2-1-4.workstation/tab11-task.html',
    'hw_server_workstation_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_server_workstation_package': '2.hardware/2-1.server/2-1-4.workstation/tab13-package.html',
    'hw_server_workstation_log': '2.hardware/2-1.server/2-1-4.workstation/tab14-log.html',
    'hw_server_workstation_file': '2.hardware/2-1.server/2-1-4.workstation/tab15-file.html',
    'hw_storage_san': (
        '2.hardware/2-2.storage/2-2-1.storage/1.storage_list.html',
        '2.hardware/2-2.storage/2-2-1.san/1.san_list.html',
    ),
    'hw_storage_san_detail': (
        '2.hardware/2-2.storage/2-2-1.storage/2.storage_detail.html',
        '2.hardware/2-2.storage/2-2-1.san/2.san_storage_detail.html',
    ),
    'hw_storage_san_basic': 'layouts/tab31-basic-storage-shared.html',
    'hw_storage_san_assign': 'layouts/tab32-assign-storage-shared.html',
    'hw_storage_san_hw': '2.hardware/2-2.storage/2-2-1.storage/tab01-hardware.html',
    'hw_storage_san_if': '2.hardware/2-2.storage/2-2-1.storage/tab04-interface.html',
    'hw_storage_san_account': '2.hardware/2-2.storage/2-2-1.storage/tab05-account.html',
    'hw_storage_san_task': (
        '2.hardware/2-2.storage/2-2-1.storage/tab11-task.html',
        '2.hardware/2-2.storage/2-2-1.san/tab11-task.html',
    ),
    'hw_storage_san_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_storage_san_package': 'layouts/tab13-package-shared.html',
    'hw_storage_san_log': '2.hardware/2-2.storage/2-2-1.storage/tab14-log.html',
    'hw_storage_san_file': '2.hardware/2-2.storage/2-2-1.storage/tab15-file.html',
    'hw_storage_backup': (
        '2.hardware/2-2.storage/2-2-2.backup/1.backup_list.html',
        '2.hardware/2-2.storage/2-2-2.ptl/1.ptl_list.html',
    ),
    'hw_storage_backup_detail': (
        '2.hardware/2-2.storage/2-2-2.backup/2.backup_detail.html',
        '2.hardware/2-2.storage/2-2-2.ptl/2.ptl_detail.html',
    ),
    'hw_storage_backup_basic': 'layouts/tab31-basic-storage-shared.html',
    'hw_storage_backup_assign': 'layouts/tab32-assign-storage-shared.html',
    'hw_storage_backup_hw': '2.hardware/2-2.storage/2-2-2.backup/tab01-hardware.html',
    'hw_storage_backup_if': '2.hardware/2-2.storage/2-2-2.backup/tab04-interface.html',
    'hw_storage_backup_account': '2.hardware/2-2.storage/2-2-2.backup/tab05-account.html',
    'hw_storage_backup_task': (
        '2.hardware/2-2.storage/2-2-2.backup/tab11-task.html',
        '2.hardware/2-2.storage/2-2-2.ptl/tab11-task.html',
    ),
    'hw_storage_backup_log': '2.hardware/2-2.storage/2-2-2.backup/tab14-log.html',
    'hw_storage_backup_file': '2.hardware/2-2.storage/2-2-2.backup/tab15-file.html',
    'hw_san_director': '2.hardware/2-3.san/2-3-1.director/1.director_list.html',
    'hw_san_director_detail': '2.hardware/2-3.san/2-3-1.director/2.director_detail.html',
    'hw_san_director_hw': '2.hardware/2-3.san/2-3-1.director/tab01-hardware.html',
    'hw_san_director_if': '2.hardware/2-3.san/2-3-1.director/tab04-interface.html',
    'hw_san_director_zone': 'layouts/tab33-zone-shared.html',
    'hw_san_director_account': '2.hardware/2-3.san/2-3-1.director/tab05-account.html',
    'hw_san_director_task': '2.hardware/2-3.san/2-3-1.director/tab11-task.html',
    'hw_san_director_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_san_director_package': 'layouts/tab13-package-shared.html',
    'hw_san_director_log': '2.hardware/2-3.san/2-3-1.director/tab14-log.html',
    'hw_san_director_file': '2.hardware/2-3.san/2-3-1.director/tab15-file.html',
    'hw_san_switch': '2.hardware/2-3.san/2-3-2.sansw/1.sansw_list.html',
    'hw_san_switch_detail': '2.hardware/2-3.san/2-3-2.sansw/2.sansw_detail.html',
    'hw_san_switch_hw': '2.hardware/2-3.san/2-3-2.sansw/tab01-hardware.html',
    'hw_san_switch_if': '2.hardware/2-3.san/2-3-2.sansw/tab04-interface.html',
    'hw_san_switch_zone': 'layouts/tab33-zone-shared.html',
    'hw_san_switch_account': '2.hardware/2-3.san/2-3-2.sansw/tab05-account.html',
    'hw_san_switch_task': '2.hardware/2-3.san/2-3-2.sansw/tab11-task.html',
    'hw_san_switch_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_san_switch_package': 'layouts/tab13-package-shared.html',
    'hw_san_switch_log': '2.hardware/2-3.san/2-3-2.sansw/tab14-log.html',
    'hw_san_switch_file': '2.hardware/2-3.san/2-3-2.sansw/tab15-file.html',
    'hw_network_l2': '2.hardware/2-4.network/2-4-1.l2/1.l2_list.html',
    'hw_network_l2_detail': '2.hardware/2-4.network/2-4-1.l2/2.l2_detail.html',
    'hw_network_l2_hw': '2.hardware/2-4.network/2-4-1.l2/tab01-hardware.html',
    'hw_network_l2_if': '2.hardware/2-4.network/2-4-1.l2/tab04-interface.html',
    'hw_network_l2_account': '2.hardware/2-4.network/2-4-1.l2/tab05-account.html',
    'hw_network_l2_task': '2.hardware/2-4.network/2-4-1.l2/tab11-task.html',
    'hw_network_l2_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_network_l2_package': 'layouts/tab13-package-shared.html',
    'hw_network_l2_log': '2.hardware/2-4.network/2-4-1.l2/tab14-log.html',
    'hw_network_l2_file': '2.hardware/2-4.network/2-4-1.l2/tab15-file.html',
    'hw_network_l4': '2.hardware/2-4.network/2-4-2.l4/1.l4_list.html',
    'hw_network_l4_detail': '2.hardware/2-4.network/2-4-2.l4/2.l4_detail.html',
    'hw_network_l4_hw': '2.hardware/2-4.network/2-4-2.l4/tab01-hardware.html',
    'hw_network_l4_if': '2.hardware/2-4.network/2-4-2.l4/tab04-interface.html',
    'hw_network_l4_account': '2.hardware/2-4.network/2-4-2.l4/tab05-account.html',
    'hw_network_l4_task': '2.hardware/2-4.network/2-4-2.l4/tab11-task.html',
    'hw_network_l4_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_network_l4_package': 'layouts/tab13-package-shared.html',
    'hw_network_l4_log': '2.hardware/2-4.network/2-4-2.l4/tab14-log.html',
    'hw_network_l4_file': '2.hardware/2-4.network/2-4-2.l4/tab15-file.html',
    'hw_network_l7': '2.hardware/2-4.network/2-4-3.l7/1.l7_list.html',
    'hw_network_l7_detail': '2.hardware/2-4.network/2-4-3.l7/2.l7_detail.html',
    'hw_network_l7_hw': '2.hardware/2-4.network/2-4-3.l7/tab01-hardware.html',
    'hw_network_l7_if': '2.hardware/2-4.network/2-4-3.l7/tab04-interface.html',
    'hw_network_l7_account': '2.hardware/2-4.network/2-4-3.l7/tab05-account.html',
    'hw_network_l7_task': '2.hardware/2-4.network/2-4-3.l7/tab11-task.html',
    'hw_network_l7_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_network_l7_package': 'layouts/tab13-package-shared.html',
    'hw_network_l7_log': '2.hardware/2-4.network/2-4-3.l7/tab14-log.html',
    'hw_network_l7_file': '2.hardware/2-4.network/2-4-3.l7/tab15-file.html',
    'hw_network_ap': '2.hardware/2-4.network/2-4-4.ap/1.ap_list.html',
    'hw_network_ap_detail': '2.hardware/2-4.network/2-4-4.ap/2.ap_detail.html',
    'hw_network_ap_hw': '2.hardware/2-4.network/2-4-4.ap/tab01-hardware.html',
    'hw_network_ap_if': '2.hardware/2-4.network/2-4-4.ap/tab04-interface.html',
    'hw_network_ap_account': '2.hardware/2-4.network/2-4-4.ap/tab05-account.html',
    'hw_network_ap_task': '2.hardware/2-4.network/2-4-4.ap/tab11-task.html',
    'hw_network_ap_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_network_ap_package': 'layouts/tab13-package-shared.html',
    'hw_network_ap_log': '2.hardware/2-4.network/2-4-4.ap/tab14-log.html',
    'hw_network_ap_file': '2.hardware/2-4.network/2-4-4.ap/tab15-file.html',
    'hw_network_dedicateline': '2.hardware/2-4.network/2-4-5.dedicateline/1.dedicateline_list.html',
    'hw_network_dedicateline_detail': '2.hardware/2-4.network/2-4-5.dedicateline/2.dedicateline_detail.html',
    'hw_network_dedicateline_hw': '2.hardware/2-4.network/2-4-5.dedicateline/tab01-hardware.html',
    'hw_network_dedicateline_if': '2.hardware/2-4.network/2-4-5.dedicateline/tab04-interface.html',
    'hw_network_dedicateline_account': '2.hardware/2-4.network/2-4-5.dedicateline/tab05-account.html',
    'hw_network_dedicateline_task': '2.hardware/2-4.network/2-4-5.dedicateline/tab11-task.html',
    'hw_network_dedicateline_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_network_dedicateline_package': 'layouts/tab13-package-shared.html',
    'hw_network_dedicateline_log': '2.hardware/2-4.network/2-4-5.dedicateline/tab14-log.html',
    'hw_network_dedicateline_file': '2.hardware/2-4.network/2-4-5.dedicateline/tab15-file.html',
    'hw_security_firewall': '2.hardware/2-5.security/2-5-1.firewall/1.firewall_list.html',
    'hw_security_firewall_detail': '2.hardware/2-5.security/2-5-1.firewall/2.firewall_detail.html',
    'hw_security_firewall_hw': '2.hardware/2-5.security/2-5-1.firewall/tab01-hardware.html',
    'hw_security_firewall_if': '2.hardware/2-5.security/2-5-1.firewall/tab04-interface.html',
    'hw_security_firewall_account': '2.hardware/2-5.security/2-5-1.firewall/tab05-account.html',
    'hw_security_firewall_task': '2.hardware/2-5.security/2-5-1.firewall/tab11-task.html',
    'hw_security_firewall_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_security_firewall_package': 'layouts/tab13-package-shared.html',
    'hw_security_firewall_log': '2.hardware/2-5.security/2-5-1.firewall/tab14-log.html',
    'hw_security_firewall_file': '2.hardware/2-5.security/2-5-1.firewall/tab15-file.html',
    'hw_security_vpn': '2.hardware/2-5.security/2-5-2.vpn/1.vpn_list.html',
    'hw_security_vpn_detail': '2.hardware/2-5.security/2-5-2.vpn/2.vpn_detail.html',
    'hw_security_vpn_hw': '2.hardware/2-5.security/2-5-2.vpn/tab01-hardware.html',
    'hw_security_vpn_if': '2.hardware/2-5.security/2-5-2.vpn/tab04-interface.html',
    'hw_security_vpn_account': '2.hardware/2-5.security/2-5-2.vpn/tab05-account.html',
    'hw_security_vpn_task': '2.hardware/2-5.security/2-5-2.vpn/tab11-task.html',
    'hw_security_vpn_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_security_vpn_package': 'layouts/tab13-package-shared.html',
    'hw_security_vpn_log': '2.hardware/2-5.security/2-5-2.vpn/tab14-log.html',
    'hw_security_vpn_file': '2.hardware/2-5.security/2-5-2.vpn/tab15-file.html',
    'hw_security_ids': '2.hardware/2-5.security/2-5-3.ids/1.ids_list.html',
    'hw_security_ids_detail': '2.hardware/2-5.security/2-5-3.ids/2.ids_detail.html',
    'hw_security_ids_hw': '2.hardware/2-5.security/2-5-3.ids/tab01-hardware.html',
    'hw_security_ids_if': '2.hardware/2-5.security/2-5-3.ids/tab04-interface.html',
    'hw_security_ids_account': '2.hardware/2-5.security/2-5-3.ids/tab05-account.html',
    'hw_security_ids_task': '2.hardware/2-5.security/2-5-3.ids/tab11-task.html',
    'hw_security_ids_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_security_ids_package': 'layouts/tab13-package-shared.html',
    'hw_security_ids_log': '2.hardware/2-5.security/2-5-3.ids/tab14-log.html',
    'hw_security_ids_file': '2.hardware/2-5.security/2-5-3.ids/tab15-file.html',
    'hw_security_ips': '2.hardware/2-5.security/2-5-4.ips/1.ips_list.html',
    'hw_security_ips_detail': '2.hardware/2-5.security/2-5-4.ips/2.ips_detail.html',
    'hw_security_ips_hw': '2.hardware/2-5.security/2-5-4.ips/tab01-hardware.html',
    'hw_security_ips_if': '2.hardware/2-5.security/2-5-4.ips/tab04-interface.html',
    'hw_security_ips_account': '2.hardware/2-5.security/2-5-4.ips/tab05-account.html',
    'hw_security_ips_task': '2.hardware/2-5.security/2-5-4.ips/tab11-task.html',
    'hw_security_ips_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_security_ips_package': 'layouts/tab13-package-shared.html',
    'hw_security_ips_log': '2.hardware/2-5.security/2-5-4.ips/tab14-log.html',
    'hw_security_ips_file': '2.hardware/2-5.security/2-5-4.ips/tab15-file.html',
    'hw_security_hsm': '2.hardware/2-5.security/2-5-5.hsm/1.hsm_list.html',
    'hw_security_hsm_detail': '2.hardware/2-5.security/2-5-5.hsm/2.hsm_detail.html',
    'hw_security_hsm_hw': '2.hardware/2-5.security/2-5-5.hsm/tab01-hardware.html',
    'hw_security_hsm_if': '2.hardware/2-5.security/2-5-5.hsm/tab04-interface.html',
    'hw_security_hsm_account': '2.hardware/2-5.security/2-5-5.hsm/tab05-account.html',
    'hw_security_hsm_task': '2.hardware/2-5.security/2-5-5.hsm/tab11-task.html',
    'hw_security_hsm_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_security_hsm_package': 'layouts/tab13-package-shared.html',
    'hw_security_hsm_log': '2.hardware/2-5.security/2-5-5.hsm/tab14-log.html',
    'hw_security_hsm_file': '2.hardware/2-5.security/2-5-5.hsm/tab15-file.html',
    'hw_security_kms': '2.hardware/2-5.security/2-5-6.kms/1.kms_list.html',
    'hw_security_kms_detail': '2.hardware/2-5.security/2-5-6.kms/2.kms_detail.html',
    'hw_security_kms_hw': '2.hardware/2-5.security/2-5-6.kms/tab01-hardware.html',
    'hw_security_kms_if': '2.hardware/2-5.security/2-5-6.kms/tab04-interface.html',
    'hw_security_kms_account': '2.hardware/2-5.security/2-5-6.kms/tab05-account.html',
    'hw_security_kms_task': '2.hardware/2-5.security/2-5-6.kms/tab11-task.html',
    'hw_security_kms_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_security_kms_package': 'layouts/tab13-package-shared.html',
    'hw_security_kms_log': '2.hardware/2-5.security/2-5-6.kms/tab14-log.html',
    'hw_security_kms_file': '2.hardware/2-5.security/2-5-6.kms/tab15-file.html',
    'hw_security_wips': '2.hardware/2-5.security/2-5-7.wips/1.wips_list.html',
    'hw_security_wips_detail': '2.hardware/2-5.security/2-5-7.wips/2.wips_detail.html',
    'hw_security_wips_hw': '2.hardware/2-5.security/2-5-7.wips/tab01-hardware.html',
    'hw_security_wips_if': '2.hardware/2-5.security/2-5-7.wips/tab04-interface.html',
    'hw_security_wips_account': '2.hardware/2-5.security/2-5-7.wips/tab05-account.html',
    'hw_security_wips_task': '2.hardware/2-5.security/2-5-7.wips/tab11-task.html',
    'hw_security_wips_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_security_wips_package': 'layouts/tab13-package-shared.html',
    'hw_security_wips_log': '2.hardware/2-5.security/2-5-7.wips/tab14-log.html',
    'hw_security_wips_file': '2.hardware/2-5.security/2-5-7.wips/tab15-file.html',
    'hw_security_etc': '2.hardware/2-5.security/2-5-8.etc/1.etc_list.html',
    'hw_security_etc_detail': '2.hardware/2-5.security/2-5-8.etc/2.etc_detail.html',
    'hw_security_etc_hw': '2.hardware/2-5.security/2-5-8.etc/tab01-hardware.html',
    'hw_security_etc_if': '2.hardware/2-5.security/2-5-8.etc/tab04-interface.html',
    'hw_security_etc_account': '2.hardware/2-5.security/2-5-8.etc/tab05-account.html',
    'hw_security_etc_task': '2.hardware/2-5.security/2-5-8.etc/tab11-task.html',
    'hw_security_etc_vulnerability': 'layouts/tab12-vulnerability-shared.html',
    'hw_security_etc_package': 'layouts/tab13-package-shared.html',
    'hw_security_etc_log': '2.hardware/2-5.security/2-5-8.etc/tab14-log.html',
    'hw_security_etc_file': '2.hardware/2-5.security/2-5-8.etc/tab15-file.html',
    # Access Control
    'access_control_status': '3.access_control/3-1.access_control/3-1-3.status/1.status_list.html',
    'access_control_access': '3.access_control/3-1.access_control/3-1-1.access/1.access_list.html',
    'access_control_request': '3.access_control/3-1.access_control/3-1-2.request/1.request_list.html',
    'access_control_audit': '3.access_control/3-1.access_control/3-1-5.audit/1.audit_list.html',
    'access_control_delegation': '3.access_control/3-1.access_control/3-1-4.delegation/1.delegation_list.html',
    # High Availability Active-Active detail & tab pages (pattern identical to unix/security_etc)
    # High Availability Active-Passive detail & tab pages (unix pattern)
    # Governance
    'gov_dr_training': '4.governance/4-1.dr_policy/4-1-1.training/1.training_list.html',
    'gov_backup_dashboard': '4.governance/4-2.backup_policy/4-2-0.backup_dashboard/1.backup_dashboard.html',
    'gov_backup_policy': '4.governance/4-2.backup_policy/4-2-1.backup_policy/1.backup_policy_list.html',
    'gov_backup_tape': '4.governance/4-2.backup_policy/4-2-2.backup_tape/1.backup_tape_list.html',
    'gov_package_dashboard': '4.governance/4-7.package_policy/4-7-0.package_dashboard/1.package_dashboard.html',
    'gov_package_list': '4.governance/4-7.package_policy/4-7-1.package_list/1.package_list.html',
    'gov_package_vulnerability': '4.governance/4-7.package_policy/4-7-2.package_vulnerability/1.package_vulnerability.html',

    # Governance: Vulnerability analysis
    'gov_vulnerability_dashboard': '4.governance/4-8.vulnerability_policy/4-8-0.vulnerability_dashboard/1.vulnerability_dashboard.html',
    'gov_vulnerability_analysis': '4.governance/4-8.vulnerability_policy/4-8-1.vulnerability_list/1.vulnerability_list.html',
    'gov_vulnerability_guide': '4.governance/4-8.vulnerability_policy/4-8-2.vulnerability_countermeasures/1.vulnerability_countermeasures.html',
    'gov_ip_policy': '4.governance/4-3.network_policy/4-3-1.ip/1.ip_list.html',
    # Governance IP policy detail (minimal basic-info page)
    'gov_ip_policy_detail': '4.governance/4-3.network_policy/4-3-1.ip/2.ip_detail.html',
    'gov_ip_policy_ip_range': 'layouts/tab41-ip_range.html',
    'gov_ip_policy_log': '4.governance/4-3.network_policy/4-3-1.ip/tab14-log.html',
    'gov_ip_policy_file': '4.governance/4-3.network_policy/4-3-1.ip/tab15-file.html',
    'gov_dns_policy': '4.governance/4-3.network_policy/4-3-2.dns/1.dns_list.html',
    # Governance DNS policy detail + tabs
    'gov_dns_policy_detail': '4.governance/4-3.network_policy/4-3-2.dns/2.dns_detail.html',
    'gov_dns_policy_dns_record': 'layouts/tab42-dns_record.html',
    'gov_dns_policy_log': '4.governance/4-3.network_policy/4-3-2.dns/tab14-log.html',
    'gov_dns_policy_file': '4.governance/4-3.network_policy/4-3-2.dns/tab15-file.html',
    'gov_ad_policy': '4.governance/4-3.network_policy/4-3-3.ad/1.ad_list.html',
    # Governance AD policy detail + tabs (unix pattern replication)
    'gov_ad_policy_detail': '4.governance/4-3.network_policy/4-3-3.ad/2.ad_detail.html',
    'gov_ad_policy_domain': 'layouts/tab44-ad_fqdn.html',
    'gov_ad_policy_account': 'layouts/tab43-ad_account.html',
    'gov_ad_policy_log': '4.governance/4-3.network_policy/4-3-3.ad/tab14-log.html',
    'gov_ad_policy_file': '4.governance/4-3.network_policy/4-3-3.ad/tab15-file.html',
    'gov_vpn_policy': '4.governance/4-4.vpn_policy/4-4-1.vpn/1.vpn_list.html',
    # Governance VPN policy detail + tabs (unix pattern replication)
    'gov_vpn_policy_detail': '4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.html',
    'gov_vpn_policy_manager': 'layouts/tab97-partner-shared.html',
    'gov_vpn_policy_communication': 'layouts/tab45-communication.html',
    'gov_vpn_policy_vpn_policy': 'layouts/tab46-vpn_policy.html',
    'gov_vpn_policy_log': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab14-log.html',
    'gov_vpn_policy_file': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab15-file.html',
    # Governance VPN policy (vpn2~5) — 모든 탭이 vpn1 템플릿을 공유
    'gov_vpn_policy2': '4.governance/4-4.vpn_policy/4-4-1.vpn/1.vpn_list.html',
    'gov_vpn_policy2_detail': '4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.html',
    'gov_vpn_policy2_manager': 'layouts/tab97-partner-shared.html',
    'gov_vpn_policy2_communication': 'layouts/tab45-communication.html',
    'gov_vpn_policy2_vpn_policy': 'layouts/tab46-vpn_policy.html',
    'gov_vpn_policy2_log': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab14-log.html',
    'gov_vpn_policy2_file': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab15-file.html',
    'gov_vpn_policy3': '4.governance/4-4.vpn_policy/4-4-1.vpn/1.vpn_list.html',
    'gov_vpn_policy3_detail': '4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.html',
    'gov_vpn_policy3_manager': 'layouts/tab97-partner-shared.html',
    'gov_vpn_policy3_communication': 'layouts/tab45-communication.html',
    'gov_vpn_policy3_vpn_policy': 'layouts/tab46-vpn_policy.html',
    'gov_vpn_policy3_log': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab14-log.html',
    'gov_vpn_policy3_file': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab15-file.html',
    'gov_vpn_policy4': '4.governance/4-4.vpn_policy/4-4-1.vpn/1.vpn_list.html',
    'gov_vpn_policy4_detail': '4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.html',
    'gov_vpn_policy4_manager': 'layouts/tab97-partner-shared.html',
    'gov_vpn_policy4_communication': 'layouts/tab45-communication.html',
    'gov_vpn_policy4_vpn_policy': 'layouts/tab46-vpn_policy.html',
    'gov_vpn_policy4_log': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab14-log.html',
    'gov_vpn_policy4_file': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab15-file.html',
    'gov_vpn_policy5': '4.governance/4-4.vpn_policy/4-4-1.vpn/1.vpn_list.html',
    'gov_vpn_policy5_detail': '4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.html',
    'gov_vpn_policy5_manager': 'layouts/tab97-partner-shared.html',
    'gov_vpn_policy5_communication': 'layouts/tab45-communication.html',
    'gov_vpn_policy5_vpn_policy': 'layouts/tab46-vpn_policy.html',
    'gov_vpn_policy5_log': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab14-log.html',
    'gov_vpn_policy5_file': '4.governance/4-4.vpn_policy/4-4-1.vpn/tab15-file.html',
    'gov_dedicatedline_member': '4.governance/4-5.dedicatedline_policy/4-5-1.member/1.member_list.html',
    # Dedicated Line Member detail + tabs (unix pattern)
    'gov_dedicatedline_member_detail': '4.governance/4-5.dedicatedline_policy/4-5-1.member/2.member_detail.html',
    'gov_dedicatedline_member_manager': 'layouts/tab97-partner-shared.html',
    'gov_dedicatedline_member_task': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab11-task.html',
    'gov_dedicatedline_member_log': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab14-log.html',
    'gov_dedicatedline_member_file': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab15-file.html',
    'gov_dedicatedline_customer': '4.governance/4-5.dedicatedline_policy/4-5-1.member/1.member_list.html',
    # Dedicated Line Customer detail + tabs → shared member templates
    'gov_dedicatedline_customer_detail': '4.governance/4-5.dedicatedline_policy/4-5-1.member/2.member_detail.html',
    'gov_dedicatedline_customer_manager': 'layouts/tab97-partner-shared.html',
    'gov_dedicatedline_customer_task': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab11-task.html',
    'gov_dedicatedline_customer_log': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab14-log.html',
    'gov_dedicatedline_customer_file': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab15-file.html',
    'gov_dedicatedline_van': '4.governance/4-5.dedicatedline_policy/4-5-1.member/1.member_list.html',
    # Dedicated Line VAN detail + tabs → shared member templates
    'gov_dedicatedline_van_detail': '4.governance/4-5.dedicatedline_policy/4-5-1.member/2.member_detail.html',
    'gov_dedicatedline_van_manager': 'layouts/tab97-partner-shared.html',
    'gov_dedicatedline_van_task': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab11-task.html',
    'gov_dedicatedline_van_log': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab14-log.html',
    'gov_dedicatedline_van_file': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab15-file.html',
    'gov_dedicatedline_affiliate': '4.governance/4-5.dedicatedline_policy/4-5-1.member/1.member_list.html',
    # Dedicated Line Affiliate detail + tabs → shared member templates
    'gov_dedicatedline_affiliate_detail': '4.governance/4-5.dedicatedline_policy/4-5-1.member/2.member_detail.html',
    'gov_dedicatedline_affiliate_manager': 'layouts/tab97-partner-shared.html',
    'gov_dedicatedline_affiliate_task': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab11-task.html',
    'gov_dedicatedline_affiliate_log': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab14-log.html',
    'gov_dedicatedline_affiliate_file': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab15-file.html',
    'gov_dedicatedline_intranet': '4.governance/4-5.dedicatedline_policy/4-5-1.member/1.member_list.html',
    # Dedicated Line Intranet detail + tabs → shared member templates
    'gov_dedicatedline_intranet_detail': '4.governance/4-5.dedicatedline_policy/4-5-1.member/2.member_detail.html',
    'gov_dedicatedline_intranet_manager': 'layouts/tab97-partner-shared.html',
    'gov_dedicatedline_intranet_task': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab11-task.html',
    'gov_dedicatedline_intranet_log': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab14-log.html',
    'gov_dedicatedline_intranet_file': '4.governance/4-5.dedicatedline_policy/4-5-1.member/tab15-file.html',
    'gov_unused_hardware': '4.governance/4-6.unused_assets/1.unused_assets.html',
    'gov_unused_server': '4.governance/4-6.unused_assets/1.unused_assets.html',
    'gov_unused_storage': '4.governance/4-6.unused_assets/1.unused_assets.html',
    'gov_unused_san': '4.governance/4-6.unused_assets/1.unused_assets.html',
    'gov_unused_network': '4.governance/4-6.unused_assets/1.unused_assets.html',
    'gov_unused_security': '4.governance/4-6.unused_assets/1.unused_assets.html',
    'gov_unused_software': '4.governance/4-6.unused_assets/4-6-2.software/1.unused_software_list.html',
    # Datacenter
    'dc_access_control': '6.datacenter/6-1.access/6-1-1.access_control/1.access_control_list.html',
    'dc_access_records': '6.datacenter/6-1.access/6-1-2.access_records/1.access_records_list.html',
    'dc_authority_control': '6.datacenter/6-1.access/6-1-3.authority_control/1.authority_control_list.html',
    'dc_authority_records': '6.datacenter/6-1.access/6-1-4.authority_records/1.authority_records_list.html',
    'dc_access_system': '6.datacenter/6-1.access/6-1-5.access_system/1.access_system_list.html',
    'dc_data_deletion': '6.datacenter/6-2.erasure/6-2-1.data_deletion_list/1.data_deletion_list.html',
    'dc_data_deletion_system': '6.datacenter/6-2.erasure/6-2-2.data_deletion_system/1.data_deletion_system.html',
    'dc_rack_lab1': '6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html',
    'dc_rack_lab2': '6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html',
    'dc_rack_lab3': '6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html',
    'dc_rack_lab4': '6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html',
    'dc_rack_list': '6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.html',
    'dc_rack_detail_basic': '6.datacenter/6-3.rack/6-3-2.rack_list/2.rack_detail.html',
    'dc_rack_detail_task': '6.datacenter/6-3.rack/6-3-2.rack_list/tab11-task.html',
    'dc_rack_detail_log': '6.datacenter/6-3.rack/6-3-2.rack_list/tab14-log.html',
    'dc_rack_detail_file': '6.datacenter/6-3.rack/6-3-2.rack_list/tab15-file.html',
    'dc_thermo_lab1': '6.datacenter/6-4.thermometer/6-4-1.system_lab/1.system_lab.html',
    'dc_thermo_lab2': '6.datacenter/6-4.thermometer/6-4-1.system_lab/1.system_lab.html',
    'dc_thermo_lab3': '6.datacenter/6-4.thermometer/6-4-1.system_lab/1.system_lab.html',
    'dc_thermo_lab4': '6.datacenter/6-4.thermometer/6-4-1.system_lab/1.system_lab.html',
    'dc_thermometer_list': '6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.html',
    'dc_thermometer_log': '6.datacenter/6-4.thermometer/6-4-3.thermometer_log/1.thermometer_log.html',
    'dc_cctv_lab1': '6.datacenter/6-6.cctv/6-6-1.system_lab/1.system_lab.html',
    'dc_cctv_lab2': '6.datacenter/6-6.cctv/6-6-1.system_lab/1.system_lab.html',
    'dc_cctv_lab3': '6.datacenter/6-6.cctv/6-6-1.system_lab/1.system_lab.html',
    'dc_cctv_lab4': '6.datacenter/6-6.cctv/6-6-1.system_lab/1.system_lab.html',
    'dc_cctv_list': '6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.html',
    # Maintenance
    'maint_contract_list': '7.maintenance/7-1.contract/7-1-1.contract_list/1.contract_list.html',
    # Cost Management
    'cost_opex_dashboard': '7.cost/7-1.opex/7-1-0.dashboard/1.dashboard.html',
    'cost_opex_hardware': '7.cost/7-1.opex/7-1-1.hardware/1.hardware_list.html',
    # Cost OPEX Hardware detail + tabs (unix pattern adaptation)
    'cost_opex_hardware_detail': '7.cost/7-1.opex/7-1-1.hardware/2.hardware_detail.html',
    'cost_opex_hardware_contract': 'layouts/tab71-opex-shared.html',
    'cost_opex_hardware_log': '7.cost/7-1.opex/7-1-1.hardware/tab14-log.html',
    'cost_opex_hardware_file': '7.cost/7-1.opex/7-1-1.hardware/tab15-file.html',
    'cost_opex_software': '7.cost/7-1.opex/7-1-2.software/1.software_list.html',
    'cost_opex_software_detail': '7.cost/7-1.opex/7-1-2.software/2.software_detail.html',
    'cost_opex_software_contract': 'layouts/tab71-opex-shared.html',
    'cost_opex_software_log': '7.cost/7-1.opex/7-1-2.software/tab14-log.html',
    'cost_opex_software_file': '7.cost/7-1.opex/7-1-2.software/tab15-file.html',
    'cost_opex_etc': '7.cost/7-1.opex/7-1-3.etc/1.etc_list.html',
    'cost_opex_etc_detail': '7.cost/7-1.opex/7-1-3.etc/2.etc_detail.html',
    'cost_opex_etc_contract': 'layouts/tab71-opex-shared.html',
    'cost_opex_etc_log': '7.cost/7-1.opex/7-1-3.etc/tab14-log.html',
    'cost_opex_etc_file': '7.cost/7-1.opex/7-1-3.etc/tab15-file.html',
    'cost_capex_hardware': '7.cost/7-2.capex/7-2-1.contract/1.contract_list.html',
    'cost_capex_hardware_detail': '7.cost/7-2.capex/7-2-1.contract/2.contract_detail.html',
    'cost_capex_hardware_contract': 'layouts/tab72-capex-shared.html',
    'cost_capex_hardware_log': '7.cost/7-2.capex/7-2-1.contract/tab14-log.html',
    'cost_capex_hardware_file': '7.cost/7-2.capex/7-2-1.contract/tab15-file.html',
    'cost_capex_software': '7.cost/7-2.capex/7-2-1.contract/1.contract_list.html',
    'cost_capex_software_detail': '7.cost/7-2.capex/7-2-1.contract/2.contract_detail.html',
    'cost_capex_software_contract': 'layouts/tab72-capex-shared.html',
    'cost_capex_software_log': '7.cost/7-2.capex/7-2-1.contract/tab14-log.html',
    'cost_capex_software_file': '7.cost/7-2.capex/7-2-1.contract/tab15-file.html',
    'cost_capex_etc': '7.cost/7-2.capex/7-2-1.contract/1.contract_list.html',
    'cost_capex_etc_detail': '7.cost/7-2.capex/7-2-1.contract/2.contract_detail.html',
    'cost_capex_etc_contract': 'layouts/tab72-capex-shared.html',
    'cost_capex_etc_log': '7.cost/7-2.capex/7-2-1.contract/tab14-log.html',
    'cost_capex_etc_file': '7.cost/7-2.capex/7-2-1.contract/tab15-file.html',

    # Cost CAPEX (new top-level tabs)
    'cost_capex_dashboard': '7.cost/7-2.capex/7-2-0.dashboard/1.dashboard.html',
    'cost_capex_contract': '7.cost/7-2.capex/7-2-1.contract/1.contract_list.html',
    # Project
    'proj_status': '8.project/8-1.project/8-1-1.my_project/1.my_project.html',
    'proj_participating': '8.project/8-1.project/8-1-2.participating_project/1.participating_project.html',
    'proj_cleared': '8.project/8-1.project/8-1-4.done_project/1.done_project.html',
    'proj_completed': '8.project/8-1.project/8-1-3.project_list/1.project_list.html',
    # Project detail + tab pages (unix pattern adaptation for 8-1-3.project_list)
    'proj_completed_detail': '8.project/8-1.project/8-1-3.project_list/2.project_detail.html',
    'proj_completed_integrity': 'layouts/tab81-integrity.html',
    'proj_completed_scope': 'layouts/tab82-scope.html',
    'proj_completed_schedule': 'layouts/tab83-schedule.html',
    'proj_completed_cost': 'layouts/tab84-cost.html',
    'proj_completed_quality': 'layouts/tab85-quality.html',
    'proj_completed_resource': 'layouts/tab86-resource.html',
    'proj_completed_communication': 'layouts/tab87-communication.html',
    'proj_completed_risk': 'layouts/tab88-risk.html',
    'proj_completed_procurement': 'layouts/tab89-procurement.html',
    'proj_completed_stakeholder': 'layouts/tab90-stakeholder.html',
    'task_status': '8.project/8-2.task/8-2-1.my_task/1.my_task.html',
    'task_participating': '8.project/8-2.task/8-2-2.participating_task/1.participating_task.html',
    'task_overview': '8.project/8-2.task/8-2-4.task_overview/1.task_overview.html',
    'task_completed': '8.project/8-2.task/8-2-3.task_list/1.task_list.html',
    # Task detail (support legacy/relative links like /p/2.task_detail.html)
    '2.task_detail.html': '8.project/8-2.task/8-2-3.task_list/2.task_detail.html',
    'workflow_progress': '8.project/8-3.desk/8-3-1.workflow/1.workflow_progress.html',
    'workflow_completed': '8.project/8-3.desk/8-3-2.complete_ticket/2.workflow_list.html',
    'wf_designer_explore': '8.project/8-4.designer/8-4-1.explore/1.wf_designer_explore.html',
    'wf_designer_manage': '8.project/8-4.designer/8-4-1.explore/1.wf_designer_explore.html',
    'wf_designer_editor': '8.project/8-4.designer/8-4-3.editor/1.wf_designer_editor.html',
    # Category
    'cat_business_dashboard': '9.category/9-1.business/9-1-0.work_dashboard/1.work_dashboard.html',
    'cat_business_work': '9.category/9-1.business/9-1-1.work_classification/1.work_classification_list.html',
    'cat_business_division': '9.category/9-1.business/9-1-2.work_division/1.work_division_list.html',
    'cat_business_status': '9.category/9-1.business/9-1-3.work_status/1.work_status_list.html',
    'cat_business_operation': '9.category/9-1.business/9-1-4.work_operation/1.work_operation_list.html',
    'cat_business_group': '9.category/9-1.business/9-1-5.work_group/1.work_group_list.html',
    # Category Business Work Group detail + tabs (Unix-style dynamic routing adaptation)
    'cat_business_group_detail': '9.category/9-1.business/9-1-5.work_group/2.work_group_detail.html',
    'cat_business_group_manager': 'layouts/tab92-employee-shared.html',
    'cat_business_group_system': 'layouts/tab91-system-shared.html',
    'cat_business_group_service': 'layouts/tab96-service-shared.html',
    'cat_business_group_task': '9.category/9-1.business/9-1-5.work_group/tab11-task.html',
    'cat_business_group_log': '9.category/9-1.business/9-1-5.work_group/tab14-log.html',
    'cat_business_group_file': '9.category/9-1.business/9-1-5.work_group/tab15-file.html',
    'cat_hw_dashboard': '9.category/9-2.hardware/0.hw_dashboard.html',
    'cat_hw_server': '9.category/9-2.hardware/9-2-1.server/1.server_list.html',
    'cat_hw_storage': '9.category/9-2.hardware/9-2-2.storage/1.storage_list.html',
    'cat_hw_san': '9.category/9-2.hardware/9-2-3.san/1.san_list.html',
    'cat_hw_network': '9.category/9-2.hardware/9-2-4.network/1.network_list.html',
    'cat_hw_security': '9.category/9-2.hardware/9-2-5.security/1.security_list.html',
    'cat_sw_dashboard': '9.category/9-3.software/0.sw_dashboard.html',
    'cat_sw_os': '9.category/9-3.software/9-3-1.os/1.os_list.html',
    # Category OS detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_sw_os_detail': '9.category/9-3.software/9-3-1.os/2.os_detail.html',
        'cat_sw_os_system': 'layouts/tab94-software-shared.html',
    'cat_sw_os_task': '9.category/9-3.software/9-3-1.os/tab11-task.html',
    'cat_sw_os_log': '9.category/9-3.software/9-3-1.os/tab14-log.html',
    'cat_sw_os_file': '9.category/9-3.software/9-3-1.os/tab15-file.html',
    'cat_sw_database': '9.category/9-3.software/9-3-2.database/1.database_list.html',
    # Category Database detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_sw_database_detail': '9.category/9-3.software/9-3-2.database/2.database_detail.html',
        'cat_sw_database_system': 'layouts/tab94-software-shared.html',
    'cat_sw_database_task': '9.category/9-3.software/9-3-2.database/tab11-task.html',
    'cat_sw_database_log': '9.category/9-3.software/9-3-2.database/tab14-log.html',
    'cat_sw_database_file': '9.category/9-3.software/9-3-2.database/tab15-file.html',
    'cat_sw_middleware': '9.category/9-3.software/9-3-3.middleware/1.middleware_list.html',
    # Category Middleware detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_sw_middleware_detail': '9.category/9-3.software/9-3-3.middleware/2.middleware_detail.html',
        'cat_sw_middleware_system': 'layouts/tab94-software-shared.html',
    'cat_sw_middleware_task': '9.category/9-3.software/9-3-3.middleware/tab11-task.html',
    'cat_sw_middleware_log': '9.category/9-3.software/9-3-3.middleware/tab14-log.html',
    'cat_sw_middleware_file': '9.category/9-3.software/9-3-3.middleware/tab15-file.html',
    'cat_sw_virtualization': '9.category/9-3.software/9-3-4.virtualization/1.virtualization_list.html',
    # Category Virtualization detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_sw_virtualization_detail': '9.category/9-3.software/9-3-4.virtualization/2.virtualization_detail.html',
        'cat_sw_virtualization_system': 'layouts/tab94-software-shared.html',
    'cat_sw_virtualization_task': '9.category/9-3.software/9-3-4.virtualization/tab11-task.html',
    'cat_sw_virtualization_log': '9.category/9-3.software/9-3-4.virtualization/tab14-log.html',
    'cat_sw_virtualization_file': '9.category/9-3.software/9-3-4.virtualization/tab15-file.html',
    'cat_sw_security': '9.category/9-3.software/9-3-5.security/1.security_list.html',
    # Category Security detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_sw_security_detail': '9.category/9-3.software/9-3-5.security/2.security_detail.html',
        'cat_sw_security_system': 'layouts/tab94-software-shared.html',
    'cat_sw_security_task': '9.category/9-3.software/9-3-5.security/tab11-task.html',
    'cat_sw_security_log': '9.category/9-3.software/9-3-5.security/tab14-log.html',
    'cat_sw_security_file': '9.category/9-3.software/9-3-5.security/tab15-file.html',
    'cat_sw_high_availability': '9.category/9-3.software/9-3-6.high_availability/1.high_availability_list.html',
    # Category High Availability detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_sw_high_availability_detail': '9.category/9-3.software/9-3-6.high_availability/2.high_availability_detail.html',
        'cat_sw_high_availability_system': 'layouts/tab94-software-shared.html',
    'cat_sw_high_availability_task': '9.category/9-3.software/9-3-6.high_availability/tab11-task.html',
    'cat_sw_high_availability_log': '9.category/9-3.software/9-3-6.high_availability/tab14-log.html',
    'cat_sw_high_availability_file': '9.category/9-3.software/9-3-6.high_availability/tab15-file.html',
    'cat_component_cpu': '9.category/9-4.component/9-4-1.cpu/1.cpu_list.html',
    # Category Component CPU detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_component_cpu_detail': '9.category/9-4.component/9-4-1.cpu/2.cpu_detail.html',
    'cat_component_cpu_system': '9.category/9-4.component/9-4-1.cpu/tab45-component.html',
    'cat_component_cpu_task': '9.category/9-4.component/9-4-1.cpu/tab11-task.html',
    'cat_component_cpu_log': '9.category/9-4.component/9-4-1.cpu/tab14-log.html',
    'cat_component_cpu_file': '9.category/9-4.component/9-4-1.cpu/tab15-file.html',
    'cat_component_gpu': '9.category/9-4.component/9-4-2.gpu/1.gpu_list.html',
    # Category Component GPU detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_component_gpu_detail': '9.category/9-4.component/9-4-2.gpu/2.gpu_detail.html',
    'cat_component_gpu_system': '9.category/9-4.component/9-4-2.gpu/tab45-component.html',
    'cat_component_gpu_task': '9.category/9-4.component/9-4-2.gpu/tab11-task.html',
    'cat_component_gpu_log': '9.category/9-4.component/9-4-2.gpu/tab14-log.html',
    'cat_component_gpu_file': '9.category/9-4.component/9-4-2.gpu/tab15-file.html',
    'cat_component_memory': '9.category/9-4.component/9-4-3.memory/1.memory_list.html',
    # Category Component MEMORY detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_component_memory_detail': '9.category/9-4.component/9-4-3.memory/2.memory_detail.html',
    'cat_component_memory_system': '9.category/9-4.component/9-4-3.memory/tab45-component.html',
    'cat_component_memory_task': '9.category/9-4.component/9-4-3.memory/tab11-task.html',
    'cat_component_memory_log': '9.category/9-4.component/9-4-3.memory/tab14-log.html',
    'cat_component_memory_file': '9.category/9-4.component/9-4-3.memory/tab15-file.html',
    'cat_component_disk': '9.category/9-4.component/9-4-4.disk/1.disk_list.html',
    # Category Component DISK detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_component_disk_detail': '9.category/9-4.component/9-4-4.disk/2.disk_detail.html',
    'cat_component_disk_system': '9.category/9-4.component/9-4-4.disk/tab45-component.html',
    'cat_component_disk_task': '9.category/9-4.component/9-4-4.disk/tab11-task.html',
    'cat_component_disk_log': '9.category/9-4.component/9-4-4.disk/tab14-log.html',
    'cat_component_disk_file': '9.category/9-4.component/9-4-4.disk/tab15-file.html',
    'cat_component_nic': '9.category/9-4.component/9-4-5.nic/1.nic_list.html',
    # Category Component NIC detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_component_nic_detail': '9.category/9-4.component/9-4-5.nic/2.nic_detail.html',
    'cat_component_nic_system': '9.category/9-4.component/9-4-5.nic/tab45-component.html',
    'cat_component_nic_task': '9.category/9-4.component/9-4-5.nic/tab11-task.html',
    'cat_component_nic_log': '9.category/9-4.component/9-4-5.nic/tab14-log.html',
    'cat_component_nic_file': '9.category/9-4.component/9-4-5.nic/tab15-file.html',
    'cat_component_hba': '9.category/9-4.component/9-4-6.hba/1.hba_list.html',
    # Category Component HBA detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_component_hba_detail': '9.category/9-4.component/9-4-6.hba/2.hba_detail.html',
    'cat_component_hba_system': '9.category/9-4.component/9-4-6.hba/tab45-component.html',
    'cat_component_hba_task': '9.category/9-4.component/9-4-6.hba/tab11-task.html',
    'cat_component_hba_log': '9.category/9-4.component/9-4-6.hba/tab14-log.html',
    'cat_component_hba_file': '9.category/9-4.component/9-4-6.hba/tab15-file.html',
    'cat_component_etc': '9.category/9-4.component/9-4-7.etc/1.etc_list.html',
    # Category Component ETC detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_component_etc_detail': '9.category/9-4.component/9-4-7.etc/2.etc_detail.html',
    'cat_component_etc_system': '9.category/9-4.component/9-4-7.etc/tab45-component.html',
    'cat_component_etc_task': '9.category/9-4.component/9-4-7.etc/tab11-task.html',
    'cat_component_etc_log': '9.category/9-4.component/9-4-7.etc/tab14-log.html',
    'cat_component_etc_file': '9.category/9-4.component/9-4-7.etc/tab15-file.html',
    'cat_company_company': '9.category/9-5.company/9-5-1.company/1.company_list.html',
    'cat_company_center': '9.category/9-5.company/9-5-1.center/1.center_list.html',
    'cat_company_department': '9.category/9-5.company/9-5-2.department/1.department_list.html',
    'cat_customer_client1': '9.category/9-6.customer/9-6-1.customer/1.client1_list.html',
    # Category Customer detail/tab pages
    'cat_customer_client1_detail': '9.category/9-6.customer/9-6-1.customer/2.client1_detail.html',
    'cat_customer_client1_manager': '9.category/9-6.customer/9-6-1.customer/tab42-client1-manager.html',
    'cat_customer_client1_task': 'layouts/tab11-task-shared.html',
    'cat_customer_client1_log': 'layouts/tab14-log-shared.html',
    'cat_customer_client1_file': '9.category/9-6.customer/9-6-1.customer/tab15-client1-file.html',
    'cat_vendor_manufacturer': '9.category/9-7.vendor/9-7-1.manufacturer/1.manufacturer_list.html',
    'cat_vendor_maintenance': '9.category/9-7.vendor/9-7-2.maintenance/1.maintenance_list.html',
    # Category Vendor Manufacturer detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_vendor_manufacturer_detail': '9.category/9-7.vendor/9-7-1.manufacturer/2.manufacturer_detail.html',
    'cat_vendor_manufacturer_manager': 'layouts/tab97-partner-shared.html',
    'cat_vendor_manufacturer_hardware': 'layouts/tab93-hardware-shared.html',
        'cat_vendor_manufacturer_software': 'layouts/tab94-software-shared.html',
    'cat_vendor_manufacturer_component': '9.category/9-7.vendor/9-7-1.manufacturer/tab45-component.html',
    'cat_vendor_manufacturer_task': '9.category/9-7.vendor/9-7-1.manufacturer/tab11-task.html',
    'cat_vendor_manufacturer_log': '9.category/9-7.vendor/9-7-1.manufacturer/tab14-log.html',
    'cat_vendor_manufacturer_file': '9.category/9-7.vendor/9-7-1.manufacturer/tab15-file.html',
    # Category Vendor Maintenance detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_vendor_maintenance_detail': '9.category/9-7.vendor/9-7-2.maintenance/2.maintenance_detail.html',
    'cat_vendor_maintenance_manager': 'layouts/tab97-partner-shared.html',
    'cat_vendor_maintenance_hardware': 'layouts/tab93-hardware-shared.html',
        'cat_vendor_maintenance_software': 'layouts/tab94-software-shared.html',
    'cat_vendor_maintenance_component': '9.category/9-7.vendor/9-7-2.maintenance/tab45-component.html',
    'cat_vendor_maintenance_sla': 'layouts/tab98-sla-shared.html',
    'cat_vendor_maintenance_issue': 'layouts/tab99-issue-shared.html',
    'cat_vendor_maintenance_task': '9.category/9-7.vendor/9-7-2.maintenance/tab11-task.html',
    'cat_vendor_maintenance_log': '9.category/9-7.vendor/9-7-2.maintenance/tab14-log.html',
    'cat_vendor_maintenance_file': '9.category/9-7.vendor/9-7-2.maintenance/tab15-file.html',
    # Category Server detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_hw_server_detail': '9.category/9-2.hardware/9-2-1.server/2.server_detail.html',
    'cat_hw_server_hardware': 'layouts/tab93-hardware-shared.html',
    'cat_hw_server_log': '9.category/9-2.hardware/9-2-1.server/tab14-log.html',
    'cat_hw_server_file': '9.category/9-2.hardware/9-2-1.server/tab15-file.html',
    # Category Storage detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_hw_storage_detail': '9.category/9-2.hardware/9-2-2.storage/2.storage_detail.html',
    'cat_hw_storage_hardware': 'layouts/tab93-hardware-shared.html',
    'cat_hw_storage_log': '9.category/9-2.hardware/9-2-2.storage/tab14-log.html',
    'cat_hw_storage_file': '9.category/9-2.hardware/9-2-2.storage/tab15-file.html',
    # Category SAN detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_hw_san_detail': '9.category/9-2.hardware/9-2-3.san/2.san_detail.html',
    'cat_hw_san_hardware': 'layouts/tab93-hardware-shared.html',
    'cat_hw_san_log': '9.category/9-2.hardware/9-2-3.san/tab14-log.html',
    'cat_hw_san_file': '9.category/9-2.hardware/9-2-3.san/tab15-file.html',
    # Category Network detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_hw_network_detail': '9.category/9-2.hardware/9-2-4.network/2.network_detail.html',
    'cat_hw_network_hardware': 'layouts/tab93-hardware-shared.html',
    'cat_hw_network_log': '9.category/9-2.hardware/9-2-4.network/tab14-log.html',
    'cat_hw_network_file': '9.category/9-2.hardware/9-2-4.network/tab15-file.html',
    # Category Security detail/tab pages (Unix-style dynamic routing adaptation)
    'cat_hw_security_detail': '9.category/9-2.hardware/9-2-5.security/2.security_detail.html',
    'cat_hw_security_hardware': 'layouts/tab93-hardware-shared.html',
    'cat_hw_security_log': '9.category/9-2.hardware/9-2-5.security/tab14-log.html',
    'cat_hw_security_file': '9.category/9-2.hardware/9-2-5.security/tab15-file.html',
    # ── 설정 ──
    'settings_info_message': '10.settings/info_message_settings.html',
    'settings_version': '10.settings/version.html',
    'help': '10.settings/help.html',
    'privacy': '10.settings/privacy.html',
}

# Debug log to verify keys on server start (temporary; can be removed)
try:
    print("[pages] hw_server_frame_detail in TEMPLATE_MAP:", 'hw_server_frame_detail' in TEMPLATE_MAP)
except Exception:
    pass

from ..utils.page_tokens import decode_manage_no, encode_manage_no
from .spa_redirect import resolve_spa_redirect


@pages_bp.route('/p/<key>')
@pages_bp.route('/p/<key>/<token>')
def show(key: str, token: str | None = None):
    # ── SPA 모드: 직접 브라우저 방문 → SPA 셸 반환 ──
    # blossom.js SPA fetch 요청(X-Requested-With 헤더)이 아닌 경우
    # 최소 셸(header+sidebar+skeleton)을 반환하고, JS가 콘텐츠를 비동기 로드한다.
    _xhr = request.headers.get('X-Requested-With', '')
    _force_full_render_keys = {
        'cat_business_dashboard',
        # 비용관리 탭은 탭 전환 실패 시에도 풀 페이지 이동으로 항상 복구되도록
        # SPA 셸 우회(직접 방문/기본 링크 이동 시에도 즉시 풀 렌더 반환)
        'cost_opex_dashboard',
        'cost_opex_hardware',
        'cost_opex_software',
        'cost_opex_etc',
        'cost_capex_dashboard',
        'cost_capex_contract',
        # 워크플로우 디자이너 페이지도 셸 고착 시 즉시 복구되도록 풀 렌더 강제
        'wf_designer_explore',
        'wf_designer_manage',
        'wf_designer_editor',
    }
    if key not in _force_full_render_keys and _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template(
            'layouts/spa_shell.html',
            current_key=key,
            menu_code=_resolve_menu_code(key),
        )

    template = _resolve_template(TEMPLATE_MAP.get(key))
    try:
        msg = f"[pages.show] key={key}, has_template={bool(template)} -> {template}\n"
        print(msg, end="")
        try:
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
            log_path = os.path.join(base_dir, 'pages_debug.log')
            with open(log_path, 'a', encoding='utf-8') as _f:
                _f.write(msg)
        except Exception:
            pass
    except Exception:
        pass
    if not template:
        # 동적 탭: TEMPLATE_MAP에 없지만 PageTabConfig에 route_key가 등록된 경우
        try:
            from app import db
            tab_row = PageTabConfig.query.filter(
                PageTabConfig.route_key == key,
                PageTabConfig.is_active == 1,
                PageTabConfig.is_deleted == 0,
            ).first()
            if tab_row:
                # page_code → 페이지 메타 (title, info_key, css)
                _DYN_META = {
                    'CATEGORY_CUSTOMER': {
                        'title': '고객 관리',
                        'info_key': 'category.customer',
                        'css': 'category2.css?v=1.0.2',
                        'columns': [
                            {'key': 'name', 'label': '고객사'},
                            {'key': 'code', 'label': '고객코드'},
                            {'key': 'phone', 'label': '대표번호'},
                            {'key': 'address', 'label': '주소'},
                            {'key': 'line_qty', 'label': '회선(수량)'},
                        ],
                    },
                    'DC_RACK': {
                        'title': 'RACK 관리',
                        'info_key': 'datacenter.rack',
                        'css': 'center.css',
                        'columns': [
                            {'key': 'name', 'label': '이름'},
                            {'key': 'code', 'label': '코드'},
                            {'key': 'phone', 'label': '대표번호'},
                            {'key': 'address', 'label': '주소'},
                            {'key': 'line_qty', 'label': '수량'},
                        ],
                    },
                    'DC_THERMOMETER': {
                        'title': '온/습도 관리',
                        'info_key': 'datacenter.temperature',
                        'css': 'center.css',
                        'columns': [
                            {'key': 'name', 'label': '이름'},
                            {'key': 'code', 'label': '코드'},
                            {'key': 'phone', 'label': '대표번호'},
                            {'key': 'address', 'label': '주소'},
                            {'key': 'line_qty', 'label': '수량'},
                        ],
                    },
                    'DC_CCTV': {
                        'title': 'CCTV 관리',
                        'info_key': 'datacenter.cctv',
                        'css': 'center.css',
                        'columns': [
                            {'key': 'name', 'label': '이름'},
                            {'key': 'code', 'label': '코드'},
                            {'key': 'phone', 'label': '대표번호'},
                            {'key': 'address', 'label': '주소'},
                            {'key': 'line_qty', 'label': '수량'},
                        ],
                    },
                }
                _dm = _DYN_META.get(tab_row.page_code, {})
                # DC_THERMOMETER system_lab: extra_options에 template_type이 있으면
                # 범용 system_lab 템플릿으로 렌더링 (페이지관리에서 추가한 배치도 탭)
                if tab_row.page_code == 'DC_THERMOMETER' and tab_row.extra_options:
                    import json as _json_dyn_th
                    try:
                        _extra_th = _json_dyn_th.loads(tab_row.extra_options) or {}
                    except Exception:
                        _extra_th = {}
                    if _extra_th.get('template_type') == 'system_lab':
                        return render_template(
                            '6.datacenter/6-4.thermometer/6-4-1.system_lab/1.system_lab.html',
                            current_key=key,
                            menu_code=_resolve_menu_code(key),
                            page_class=_extra_th.get('page_class', 'page-system-lab'),
                            center_name=_extra_th.get('center_name', tab_row.tab_name),
                            bg_image=_extra_th.get('bg_image', ''),
                            layout_style=_extra_th.get('layout_style', ''),
                            overlay_store_key=_extra_th.get('overlay_store_key', ''),
                            overlay_floor_key=_extra_th.get('overlay_floor_key', ''),
                        )
                # DC_CCTV system_lab: extra_options에 template_type이 있으면
                # 범용 system_lab 템플릿으로 렌더링 (페이지관리에서 추가한 배치도 탭)
                if tab_row.page_code == 'DC_CCTV' and tab_row.extra_options:
                    import json as _json_dyn
                    try:
                        _extra = _json_dyn.loads(tab_row.extra_options) or {}
                    except Exception:
                        _extra = {}
                    if _extra.get('template_type') == 'system_lab':
                        return render_template(
                            '6.datacenter/6-6.cctv/6-6-1.system_lab/1.system_lab.html',
                            current_key=key,
                            menu_code=_resolve_menu_code(key),
                            page_class=_extra.get('page_class', 'page-cctv-lab'),
                            center_name=_extra.get('center_name', tab_row.tab_name),
                            bg_image=_extra.get('bg_image', ''),
                            api_base=_extra.get('api_base', ''),
                            overlay_store_key=_extra.get('overlay_store_key', ''),
                            legacy_overlay_keys=_extra.get('legacy_overlay_keys', []),
                        )
                # DC_RACK system_lab: extra_options에 template_type이 있으면
                # 범용 system_lab 템플릿으로 렌더링 (페이지관리에서 추가한 배치도 탭)
                if tab_row.page_code == 'DC_RACK' and tab_row.extra_options:
                    import json as _json_dyn_rk
                    try:
                        _extra_rk = _json_dyn_rk.loads(tab_row.extra_options) or {}
                    except Exception:
                        _extra_rk = {}
                    if _extra_rk.get('template_type') == 'system_lab':
                        return render_template(
                            '6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html',
                            current_key=key,
                            menu_code=_resolve_menu_code(key),
                            page_class=_extra_rk.get('page_class', 'page-rack-lab'),
                            center_name=_extra_rk.get('center_name', tab_row.tab_name),
                            bg_image=_extra_rk.get('bg_image', ''),
                            layout_style=_extra_rk.get('layout_style', ''),
                            overlay_store_key=_extra_rk.get('overlay_store_key', ''),
                            surface_api_base=_extra_rk.get('surface_api_base', ''),
                            center_code=_extra_rk.get('center_code', ''),
                        )
                return render_template(
                    'common/dynamic_tab_placeholder.html',
                    current_key=key,
                    menu_code=_resolve_menu_code(key),
                    page_code=tab_row.page_code,
                    tab_name=tab_row.tab_name,
                    page_title=_dm.get('title', ''),
                    info_key=_dm.get('info_key', ''),
                    page_css=_dm.get('css', ''),
                    columns=_dm.get('columns', []),
                )
        except Exception:
            pass
        return abort(404)

    # All tab14 change-log templates across the repo were duplicated and some became corrupted
    # (mojibake + malformed tags). Route log pages through a single known-good template.
    _tab14_title = None
    _tab14_subtitle = None
    # AD/DNS 정책은 자체 로그 API(/api/network/ad/{id}/logs 등)를 사용하므로
    # 중앙 변경이력 공유 템플릿 우회 대상에서 제외한다.
    _TAB14_SKIP_SHARED = set()
    if (str(template).endswith('/tab14-log.html') or str(template).endswith('\\tab14-log.html')) and key not in _TAB14_SKIP_SHARED:
        base_key = key[:-4] if key.endswith('_log') else key
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # 하드웨어 상세 페이지의 title/subtitle은 클라이언트 JS가
        # sessionStorage에서 실제 업무명/시스템명을 읽어 설정한다.
        # 서버 측 폴백을 설정하지 않아야 JS가 "-"를 감지하고 교체할 수 있다.

        # 각 장비 유형별 sessionStorage 키 prefix 매핑
        # (리스트 페이지 JS가 selection 시 사용하는 prefix)
        _STORAGE_PREFIX_MAP = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_storage':       'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_storage_ptl':           'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_sansw':             'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP.get(base_key, '')

        tab_specs = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]

        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 카테고리>비즈니스>업무그룹: 탭 6개 (기본정보, 담당자, 시스템, 서비스, 변경이력, 구성/파일)
        if base_key == 'cat_business_group':
            _wg_order = ('_detail', '_manager', '_system', '_service', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_wg_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_wg_order) if t['key'].endswith(s)), 99))
            back_label = '목록으로 돌아가기'

        # 카테고리>소프트웨어 상세: 탭 4개만 표시 (기본정보, 소프트웨어, 변경이력, 구성/파일)
        if str(base_key).startswith('cat_sw_'):
            for tab in tabs:
                if tab['key'].endswith('_system'):
                    tab['label'] = '소프트웨어'
            tabs = [t for t in tabs if t['key'].endswith(('_detail', '_system', '_log', '_file'))]
            back_label = '목록으로 돌아가기'

        # 카테고리>컴포넌트 상세: 탭 4개만 표시 (기본정보, 컴포넌트, 변경이력, 구성/파일)
        if str(base_key).startswith('cat_component_'):
            for tab in tabs:
                if tab['key'].endswith('_system'):
                    tab['label'] = '컴포넌트'
            tabs = [t for t in tabs if t['key'].endswith(('_detail', '_system', '_log', '_file'))]
            back_label = '목록으로 돌아가기'

        # 카테고리>하드웨어 / 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        # VPN 정책 상세: 탭 라벨 오버라이드
        if str(base_key).startswith('gov_vpn_policy'):
            for tab in tabs:
                if tab['key'].endswith('_communication'):
                    tab['label'] = '통신정책'
                elif tab['key'].endswith('_vpn_policy'):
                    tab['label'] = '상세설정'

        # Friendly back button labels for cost modules (keep parity with their detail/tab templates)
        try:
            _bt = _resolve_template(TEMPLATE_MAP.get(base_key))
            _bt = str(_bt).replace('\\', '/') if _bt else ''
            if '/7.cost/7-1.opex/7-1-1.hardware/' in _bt:
                back_label = '목록으로 돌아가기'
            elif '/7.cost/7-1.opex/7-1-2.software/' in _bt:
                back_label = '목록으로 돌아가기'
            elif '/7.cost/7-1.opex/7-1-3.etc/' in _bt:
                back_label = '목록으로 돌아가기'
        except Exception:
            back_label = None

        # 거버넌스 IP 정책 상세: 목록 돌아가기 텍스트
        if base_key == 'gov_ip_policy':
            back_label = '목록으로 돌아가기'
        if base_key == 'gov_dns_policy':
            back_label = '목록으로 돌아가기'
        if base_key == 'gov_ad_policy':
            back_label = '목록으로 돌아가기'

        # CAPEX: after consolidating templates, always return to the unified contract list.
        if str(base_key).startswith('cost_capex_'):
            if 'cost_capex_contract' in TEMPLATE_MAP:
                back_key = 'cost_capex_contract'
            back_label = '목록으로 돌아가기'

        # 거버넌스 VPN 정책: 목록 돌아가기 텍스트
        if str(base_key).startswith('gov_vpn_policy'):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab14-log-shared.html'

    # ── tab08 방화벽 공유 템플릿 ─────────────────────────────────────────
    # 모든 _firewalld 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이는 storage_prefix, back_key, tabs 등 컨텍스트 변수로 주입.
    _TAB08_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_fw_tab = (
        key.endswith('_firewalld')
        and key not in _TAB08_SKIP_SHARED
    )
    if _is_fw_tab:
        base_key = key[:-10] if key.endswith('_firewalld') else key  # strip '_firewalld'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        _TAB08_STORAGE_PREFIX_MAP = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_storage':       'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_storage_ptl':           'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_sansw':             'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab08_storage_prefix = _TAB08_STORAGE_PREFIX_MAP.get(base_key, '')

        tab_specs = [
            ('_detail', '기본정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]

        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith('hw_server_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_storage_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_network_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_security_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_san_'):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab08-firewalld-shared.html'

    # ── tab32 할당정보(스토리지) 공유 템플릿 ─────────────────────────────
    # hw_storage_san_assign / hw_storage_backup_assign 을 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록, storage_prefix)는 컨텍스트 변수로 주입.
    _TAB32_ASSIGN_KEYS = {
        'hw_storage_san_assign':    ('hw_storage_san',    'storage_san'),
        'hw_storage_backup_assign': ('hw_storage_backup', 'storage_backup'),
    }
    _is_tab32_assign = key in _TAB32_ASSIGN_KEYS
    if _is_tab32_assign:
        _tab32_back_key, _tab32_storage_prefix = _TAB32_ASSIGN_KEYS[key]
        back_key = _tab32_back_key if _tab32_back_key in TEMPLATE_MAP else None
        back_label = '목록으로 돌아가기'

        # 탭 네비게이션 자동 생성 (해당 스토리지 도메인의 모든 탭)
        _tab32_base = key[:-7]  # strip '_assign' → 'hw_storage_san' / 'hw_storage_backup'
        _tab32_tab_specs = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_hw', '하드웨어'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in _tab32_tab_specs:
            tab_key = _tab32_base + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        template = 'layouts/tab32-assign-storage-shared.html'
    # ── tab21 전면베이 공유 템플릿 ───────────────────────────────────────
    # _frontbay 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록, storage_prefix 등)는 컨텍스트 변수로 주입.
    _is_frontbay_tab = key.endswith('_frontbay')
    if _is_frontbay_tab:
        base_key = key[:-9] if key.endswith('_frontbay') else key  # strip '_frontbay'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        _TAB21_STORAGE_PREFIX_MAP = {
            'hw_server_frame':          'frame',
        }
        _tab21_storage_prefix = _TAB21_STORAGE_PREFIX_MAP.get(base_key, '')

        tab_specs = [
            ('_detail', '기본정보'),
            ('_frontbay', '전면베이'),
            ('_rearbay', '후면베이'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]

        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        if str(base_key).startswith('hw_server_'):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab21-frontbay-shared.html'

    # ── tab22 후면베이 공유 템플릿 ───────────────────────────────────────
    # _rearbay 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    _is_rearbay_tab = key.endswith('_rearbay')
    if _is_rearbay_tab:
        base_key = key[:-8] if key.endswith('_rearbay') else key  # strip '_rearbay'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        _TAB22_STORAGE_PREFIX_MAP = {
            'hw_server_frame':          'frame',
        }
        _tab22_storage_prefix = _TAB22_STORAGE_PREFIX_MAP.get(base_key, '')

        tab_specs = [
            ('_detail', '기본정보'),
            ('_frontbay', '전면베이'),
            ('_rearbay', '후면베이'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]

        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        if str(base_key).startswith('hw_server_'):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab22-rearbay-shared.html'

    # ── tab10 스토리지 공유 템플릿 ───────────────────────────────────────
    # 모든 _storage 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록, storage_prefix)는 컨텍스트 변수로 주입.
    _TAB10_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_storage_tab = (
        str(template) == 'layouts/tab10-storage-shared.html'
        and key.endswith('_storage')
        and key not in _TAB10_SKIP_SHARED
    )
    if _is_storage_tab:
        base_key = key[:-8] if key.endswith('_storage') else key  # strip '_storage'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # sessionStorage prefix 매핑
        _TAB10_STORAGE_PREFIX_MAP = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_storage':       'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_storage_ptl':           'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_sansw':             'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _TAB10_STORAGE_PREFIX_MAP.get(base_key, '')

        # 탭 네비게이션 자동 생성
        tab_specs = [
            ('_detail', '기본정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 도메인별 back_label 오버라이드
        if str(base_key).startswith('hw_server_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_storage_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_network_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_security_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_san_'):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab10-storage-shared.html'

    # ── tab11 작업이력 공유 템플릿 ───────────────────────────────────────
    # 모든 _task 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 하드웨어 상세 → project 모드 (wrk_report API, 읽기 전용 + 통계)
    # 소프트웨어/카테고리/거버넌스 → local 모드 (ui_task_history CRUD)
    _TAB11_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_task_tab = (
        (str(template).endswith('/tab11-task.html') or str(template).endswith('\\tab11-task.html'))
        and key.endswith('_task')
        and key not in _TAB11_SKIP_SHARED
    )
    if _is_task_tab:
        base_key = key[:-5] if key.endswith('_task') else key  # strip '_task'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # ── 모드 판정: hw_ 로 시작하면 project, 그 외 local ──
        _tab11_mode = 'project' if str(base_key).startswith('hw_') else 'local'

        # ── 하드웨어 sessionStorage prefix 매핑 (project 모드) ──
        _TAB11_STORAGE_PREFIX_MAP = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_storage':       'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_storage_ptl':           'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_sansw':             'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab11_storage_prefix = _TAB11_STORAGE_PREFIX_MAP.get(base_key, '')

        # ── local CRUD scope_type 매핑 (local 모드) ──
        _tab11_scope_type = ''
        _tab11_scope_id = ''
        _tab11_scope_ref = ''
        if _tab11_mode == 'local':
            # 소프트웨어 상세
            if str(base_key).startswith('sw_'):
                _tab11_scope_type = 'software_asset'
            # 카테고리
            elif str(base_key).startswith('cat_'):
                _tab11_scope_type = 'category'
            # 거버넌스 전용선
            elif str(base_key).startswith('gov_dedicatedline_'):
                _tab11_scope_type = 'leased_line'
            # 데이터센터 랙
            elif str(base_key).startswith('dc_rack'):
                _tab11_scope_type = 'datacenter_rack'
            else:
                _tab11_scope_type = base_key

        # 탭 네비게이션 자동 생성 (tab14-log 와 동일한 tab_specs)
        tab_specs = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # ── 각 도메인별 back_label 오버라이드 ──
        if str(base_key).startswith('cat_business_group'):
            _wg_order = ('_detail', '_manager', '_system', '_service', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_wg_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_wg_order) if t['key'].endswith(s)), 99))
            back_label = '목록으로 돌아가기'

        if str(base_key).startswith('cat_sw_'):
            for tab in tabs:
                if tab['key'].endswith('_system'):
                    tab['label'] = '소프트웨어'
            tabs = [t for t in tabs if t['key'].endswith(('_detail', '_system', '_log', '_file'))]
            back_label = '목록으로 돌아가기'

        if str(base_key).startswith('cat_component_'):
            for tab in tabs:
                if tab['key'].endswith('_system'):
                    tab['label'] = '컴포넌트'
            tabs = [t for t in tabs if t['key'].endswith(('_detail', '_system', '_log', '_file'))]
            back_label = '목록으로 돌아가기'

        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        if str(base_key).startswith('cat_customer_'):
            back_label = '목록으로 돌아가기'

        if str(base_key).startswith('cat_vendor_'):
            back_label = '목록으로 돌아가기'

        if str(base_key).startswith('sw_'):
            if not back_label:
                back_label = '목록으로 돌아가기'

        if str(base_key).startswith('gov_vpn_policy'):
            for tab in tabs:
                if tab['key'].endswith('_communication'):
                    tab['label'] = '통신정책'
                elif tab['key'].endswith('_vpn_policy'):
                    tab['label'] = '상세설정'
            back_label = '목록으로 돌아가기'

        if str(base_key).startswith('gov_dedicatedline_'):
            back_label = '목록으로 돌아가기'

        if base_key == 'gov_ip_policy':
            back_label = '목록으로 돌아가기'
        if base_key == 'gov_dns_policy':
            back_label = '목록으로 돌아가기'

        if base_key == 'dc_rack_detail':
            back_label = '목록으로 돌아가기'

        try:
            _tt = _resolve_template(TEMPLATE_MAP.get(base_key))
            _tt = str(_tt).replace('\\', '/') if _tt else ''
            if '/7.cost/7-1.opex/7-1-1.hardware/' in _tt:
                back_label = '목록으로 돌아가기'
            elif '/7.cost/7-1.opex/7-1-2.software/' in _tt:
                back_label = '목록으로 돌아가기'
            elif '/7.cost/7-1.opex/7-1-3.etc/' in _tt:
                back_label = '목록으로 돌아가기'
        except Exception:
            pass

        if str(base_key).startswith('cost_capex_'):
            if 'cost_capex_contract' in TEMPLATE_MAP:
                back_key = 'cost_capex_contract'
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab11-task-shared.html'

    # ── tab12 취약점 공유 템플릿 ─────────────────────────────────────────
    # 모든 _vulnerability 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록, data-asset-category)는 컨텍스트 변수로 주입.
    _TAB12_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_vulnerability_tab = (
        template == 'layouts/tab12-vulnerability-shared.html'
        and key.endswith('_vulnerability')
        and key not in _TAB12_SKIP_SHARED
    )
    if _is_vulnerability_tab:
        base_key = key[:-14] if key.endswith('_vulnerability') else key  # strip '_vulnerability'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # data-asset-category 매핑 (tab12-vulnerability.js의 autoInit이 사용)
        _TAB12_ASSET_CATEGORY_MAP = {
            'hw_server_onpremise':      'ON_PREMISE',
            'hw_server_cloud':          'CLOUD',
            'hw_server_frame':          'FRAME',
            'hw_server_workstation':    'WORKSTATION',
            'hw_storage_san':           'STORAGE_SAN',
            'hw_san_director':          'SAN_DIRECTOR',
            'hw_san_switch':            'SAN_SWITCH',
            'hw_network_l2':            'NETWORK_L2',
            'hw_network_l4':            'NETWORK_L4',
            'hw_network_l7':            'NETWORK_L7',
            'hw_network_ap':            'NETWORK_AP',
            'hw_network_dedicateline':  'NETWORK_CIRCUIT',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab12_asset_category = _TAB12_ASSET_CATEGORY_MAP.get(base_key, base_key.upper())

        # 탭 네비게이션 자동 생성
        tab_specs = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_maintenance', '유지보수'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # ── 각 도메인별 back_label 오버라이드 ──
        if str(base_key).startswith('hw_server_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_storage_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_network_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_security_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_san_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('sw_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('cat_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('gov_'):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab12-vulnerability-shared.html'

    # ── tab13 패키지 공유 템플릿 ─────────────────────────────────────────
    # 모든 _package 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록, data-scope 등)는 컨텍스트 변수로 주입.
    _TAB13_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_package_tab = (
        (
            str(template).endswith('/tab13-package.html')
            or str(template).endswith('\\tab13-package.html')
            or str(template) == 'layouts/tab13-package-shared.html'
        )
        and key.endswith('_package')
        and key not in _TAB13_SKIP_SHARED
    )
    if _is_package_tab:
        base_key = key[:-8] if key.endswith('_package') else key  # strip '_package'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # data-scope 매핑 (tab13-package.js의 autoInit이 사용)
        _TAB13_SCOPE_MAP = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_san':           'storage_san',
            'hw_storage_storage':       'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_storage_ptl':           'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_switch':            'san_switch',
            'hw_san_sansw':             'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'firewall',
            'hw_security_vpn':          'vpn',
            'hw_security_ids':          'ids',
            'hw_security_ips':          'ips',
            'hw_security_hsm':          'hsm',
            'hw_security_kms':          'kms',
            'hw_security_wips':         'wips',
            'hw_security_etc':          'security-etc',
        }
        _tab13_scope = _TAB13_SCOPE_MAP.get(base_key, '')
        _tab14_storage_prefix = _tab13_scope  # header 복원용

        # 탭 네비게이션 자동 생성
        tab_specs = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 각 도메인별 back_label 오버라이드
        if str(base_key).startswith('hw_server_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_storage_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_network_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_security_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_san_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('cat_hw_'):
            back_label = '목록으로 돌아가기'

        if str(base_key).startswith('gov_vpn_policy'):
            for tab in tabs:
                if tab['key'].endswith('_communication'):
                    tab['label'] = '통신정책'
                elif tab['key'].endswith('_vpn_policy'):
                    tab['label'] = '상세설정'
            back_label = '목록으로 돌아가기'

        try:
            _pt = _resolve_template(TEMPLATE_MAP.get(base_key))
            _pt = str(_pt).replace('\\', '/') if _pt else ''
            if '/7.cost/7-1.opex/7-1-1.hardware/' in _pt:
                back_label = '목록으로 돌아가기'
            elif '/7.cost/7-1.opex/7-1-2.software/' in _pt:
                back_label = '목록으로 돌아가기'
            elif '/7.cost/7-1.opex/7-1-3.etc/' in _pt:
                back_label = '목록으로 돌아가기'
        except Exception:
            pass

        if str(base_key).startswith('cost_capex_'):
            if 'cost_capex_contract' in TEMPLATE_MAP:
                back_key = 'cost_capex_contract'
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab13-package-shared.html'

    # ── tab15 구성/파일 공유 템플릿 ──────────────────────────────────────
    # 모든 _file 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록 등)는 컨텍스트 변수로 주입.
    _TAB15_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_file_tab = (
        (str(template).endswith('/tab15-file.html') or str(template).endswith('\\tab15-file.html')
         or str(template).endswith('-file.html'))
        and key.endswith('_file')
        and key not in _TAB15_SKIP_SHARED
    )
    if _is_file_tab:
        base_key = key[:-5] if key.endswith('_file') else key  # strip '_file'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # 탭 네비게이션 자동 생성 (tab14-log와 동일한 tab_specs 재사용)
        tab_specs = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 카테고리>비즈니스>업무그룹
        if base_key == 'cat_business_group':
            _wg_order = ('_detail', '_manager', '_system', '_service', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_wg_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_wg_order) if t['key'].endswith(s)), 99))
            back_label = '목록으로 돌아가기'

        # 카테고리>소프트웨어
        if str(base_key).startswith('cat_sw_'):
            for tab in tabs:
                if tab['key'].endswith('_system'):
                    tab['label'] = '소프트웨어'
            tabs = [t for t in tabs if t['key'].endswith(('_detail', '_system', '_log', '_file'))]
            back_label = '목록으로 돌아가기'

        # 카테고리>컴포넌트
        if str(base_key).startswith('cat_component_'):
            for tab in tabs:
                if tab['key'].endswith('_system'):
                    tab['label'] = '컴포넌트'
            tabs = [t for t in tabs if t['key'].endswith(('_detail', '_system', '_log', '_file'))]
            back_label = '목록으로 돌아가기'

        # 카테고리>하드웨어 / 하드웨어 상세
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        # 카테고리>고객
        if str(base_key).startswith('cat_customer_'):
            back_label = '목록으로 돌아가기'

        # 카테고리>벤더
        if str(base_key).startswith('cat_vendor_'):
            back_label = '목록으로 돌아가기'

        # VPN 정책
        if str(base_key).startswith('gov_vpn_policy'):
            for tab in tabs:
                if tab['key'].endswith('_communication'):
                    tab['label'] = '통신정책'
                elif tab['key'].endswith('_vpn_policy'):
                    tab['label'] = '상세설정'
            back_label = '목록으로 돌아가기'

        # 거버넌스 전용선
        if str(base_key).startswith('gov_dedicatedline_'):
            back_label = '목록으로 돌아가기'

        # 거버넌스 IP/DNS/AD 정책
        if base_key == 'gov_ip_policy':
            back_label = '목록으로 돌아가기'
        if base_key == 'gov_dns_policy':
            back_label = '목록으로 돌아가기'
        if base_key == 'gov_ad_policy':
            back_label = '목록으로 돌아가기'

        # OPEX
        try:
            _ft = _resolve_template(TEMPLATE_MAP.get(base_key))
            _ft = str(_ft).replace('\\', '/') if _ft else ''
            if '/7.cost/7-1.opex/7-1-1.hardware/' in _ft:
                back_label = '목록으로 돌아가기'
            elif '/7.cost/7-1.opex/7-1-2.software/' in _ft:
                back_label = '목록으로 돌아가기'
            elif '/7.cost/7-1.opex/7-1-3.etc/' in _ft:
                back_label = '목록으로 돌아가기'
        except Exception:
            pass

        # CAPEX
        if str(base_key).startswith('cost_capex_'):
            if 'cost_capex_contract' in TEMPLATE_MAP:
                back_key = 'cost_capex_contract'
            back_label = '목록으로 돌아가기'

        # 소프트웨어 상세
        if str(base_key).startswith('sw_'):
            if not back_label:
                back_label = '목록으로 돌아가기'

        # 데이터센터 랙
        if base_key == 'dc_rack_detail':
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab15-file-shared.html'

    # ── tab04 인터페이스 공유 템플릿 ──────────────────────────────────────
    # 모든 _if 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록 등)는 컨텍스트 변수로 주입.
    _TAB04_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_if_tab = (
        (str(template).endswith('/tab04-interface.html') or str(template).endswith('\\tab04-interface.html'))
        and key.endswith('_if')
        and key not in _TAB04_SKIP_SHARED
    )
    if _is_if_tab:
        base_key = key[:-3] if key.endswith('_if') else key  # strip '_if'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # sessionStorage 키 prefix 매핑 (tab14-log와 동일)
        _STORAGE_PREFIX_MAP_IF = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_san':           'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_switch':            'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP_IF.get(base_key, '')

        # 탭 네비게이션 자동 생성 (tab14-log/tab15-file과 동일한 tab_specs)
        tab_specs_if = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_if:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab04-interface-shared.html'

    # ── tab33 존 구성 공유 템플릿 ──────────────────────────────────────
    # SAN 디렉터 / SAN 스위치의 _zone 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    _is_zone_tab = (
        str(template).endswith('tab33-zone-shared.html')
        and key.endswith('_zone')
    )
    if _is_zone_tab:
        base_key = key[:-5] if key.endswith('_zone') else key  # strip '_zone'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        _STORAGE_PREFIX_MAP_ZONE = {
            'hw_san_director':  'san_director',
            'hw_san_switch':    'san_switch',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP_ZONE.get(base_key, '')

        tab_specs_zone = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_zone:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

    # ── tab05 계정관리 공유 템플릿 ──────────────────────────────────────
    # 모든 _account 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록 등)는 컨텍스트 변수로 주입.
    _TAB05_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_account_tab = (
        (str(template).endswith('/tab05-account.html') or str(template).endswith('\\tab05-account.html'))
        and key.endswith('_account')
        and key not in _TAB05_SKIP_SHARED
    )
    if _is_account_tab:
        base_key = key[:-8] if key.endswith('_account') else key  # strip '_account'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # sessionStorage 키 prefix 매핑 (하드웨어 장비용)
        _STORAGE_PREFIX_MAP_AM = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_san':           'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_switch':            'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP_AM.get(base_key, '')

        # 소프트웨어 상세 페이지의 storage_prefix 추론
        if not _tab14_storage_prefix and str(base_key).startswith('sw_'):
            _sw_parts = base_key.split('_')
            _tab14_storage_prefix = '_'.join(_sw_parts[1:]) if len(_sw_parts) > 1 else base_key

        # 탭 네비게이션 자동 생성
        tab_specs_am = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_am:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        # 소프트웨어 상세
        if str(base_key).startswith('sw_'):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab05-account-shared.html'

    # ── tab01 하드웨어 공유 템플릿 ──────────────────────────────────────
    # 모든 _hw 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록 등)는 컨텍스트 변수로 주입.
    _TAB01_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_hw_tab = (
        (str(template).endswith('/tab01-hardware.html') or str(template).endswith('\\tab01-hardware.html'))
        and key.endswith('_hw')
        and key not in _TAB01_SKIP_SHARED
    )
    if _is_hw_tab:
        base_key = key[:-3] if key.endswith('_hw') else key  # strip '_hw'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # sessionStorage 키 prefix 매핑 (하드웨어 장비용)
        _STORAGE_PREFIX_MAP_HW = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_san':           'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_switch':            'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP_HW.get(base_key, '')

        # 탭 네비게이션 자동 생성
        tab_specs_hw = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_hw:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab01-hardware-shared.html'

    # ── tab02 소프트웨어 공유 템플릿 ──────────────────────────────────────
    # 모든 _sw 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록 등)는 컨텍스트 변수로 주입.
    _TAB02_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_sw_tab = (
        (str(template).endswith('/tab02-software.html') or str(template).endswith('\\tab02-software.html'))
        and key.endswith('_sw')
        and key not in _TAB02_SKIP_SHARED
    )
    if _is_sw_tab:
        base_key = key[:-3] if key.endswith('_sw') else key  # strip '_sw'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # sessionStorage 키 prefix 매핑 (하드웨어 장비용)
        _STORAGE_PREFIX_MAP_SW = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_san':           'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_switch':            'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP_SW.get(base_key, '')

        # 탭 네비게이션 자동 생성
        tab_specs_sw = [
            ('_detail', '기본정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_sw:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab02-software-shared.html'

    # ── tab31 구성정보(스토리지) 공유 템플릿 ──────────────────────────────
    # 모든 _basic 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록, 스토리지 스코프 등)는 컨텍스트 변수로 주입.
    _is_basic_tab = (
        str(template) == 'layouts/tab31-basic-storage-shared.html'
        and key.endswith('_basic')
    )
    if _is_basic_tab:
        base_key = key[:-6] if key.endswith('_basic') else key  # strip '_basic'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # 스토리지 스코프 매핑: 스코프 키, API 경로, sessionStorage prefix, 목록 경로
        _TAB31_SCOPE_MAP = {
            'hw_storage_san':    {'scope_key': 'san', 'api_base': '/api/hardware/storage/assets',        'asset_prefix': 'storage_san',    'list_path': '/p/hw_storage_san'},
            'hw_storage_backup': {'scope_key': 'ptl', 'api_base': '/api/hardware/storage/backup/assets', 'asset_prefix': 'storage_backup', 'list_path': '/p/hw_storage_backup'},
            'hw_security_vpn':   {'scope_key': 'vpn', 'api_base': '',                                   'asset_prefix': 'SECURITY_VPN',   'list_path': '/p/hw_security_vpn'},
        }
        _tab31_cfg = _TAB31_SCOPE_MAP.get(base_key, {})
        _tab31_scope_key    = _tab31_cfg.get('scope_key', '')
        _tab31_api_base     = _tab31_cfg.get('api_base', '')
        _tab31_asset_prefix = _tab31_cfg.get('asset_prefix', '')
        _tab31_list_path    = _tab31_cfg.get('list_path', '')

        # 탭 네비게이션 자동 생성
        tab_specs_basic = [
            ('_detail', '기본정보'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_basic:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 뒤로가기 라벨
        if str(base_key).startswith('hw_storage_'):
            back_label = '목록으로 돌아가기'
        elif str(base_key).startswith('hw_security_'):
            back_label = '목록으로 돌아가기'
        else:
            back_label = '목록으로 돌아가기'

    # ── tab03 백업정책 공유 템플릿 ──────────────────────────────────────
    # 모든 _backup 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록 등)는 컨텍스트 변수로 주입.
    _TAB03_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_bk_tab = (
        (str(template).endswith('/tab03-backup.html') or str(template).endswith('\\tab03-backup.html'))
        and key.endswith('_backup')
        and key not in _TAB03_SKIP_SHARED
    )
    if _is_bk_tab:
        base_key = key[:-7] if key.endswith('_backup') else key  # strip '_backup'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # sessionStorage 키 prefix 매핑 (하드웨어 장비용)
        _STORAGE_PREFIX_MAP_BK = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_san':           'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_switch':            'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP_BK.get(base_key, '')

        # 탭 네비게이션 자동 생성
        tab_specs_bk = [
            ('_detail', '기본정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_bk:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab03-backup-shared.html'

    # ── tab06 권한관리 공유 템플릿 ──────────────────────────────────────
    # 모든 _authority 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록 등)는 컨텍스트 변수로 주입.
    _TAB06_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_au_tab = (
        (str(template).endswith('/tab06-authority.html') or str(template).endswith('\\tab06-authority.html'))
        and key.endswith('_authority')
        and key not in _TAB06_SKIP_SHARED
    )
    if _is_au_tab:
        base_key = key[:-10] if key.endswith('_authority') else key  # strip '_authority'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # sessionStorage 키 prefix 매핑 (하드웨어 장비용)
        _STORAGE_PREFIX_MAP_AU = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_san':           'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_switch':            'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP_AU.get(base_key, '')

        # 탭 네비게이션 자동 생성
        tab_specs_au = [
            ('_detail', '기본정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_au:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab06-authority-shared.html'

    # ── tab07 기동절차 공유 템플릿 ──────────────────────────────────────
    # 모든 _activate 탭 페이지를 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이(뒤로가기, 탭 목록 등)는 컨텍스트 변수로 주입.
    _TAB07_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _is_ac_tab = (
        (str(template).endswith('/tab07-activate.html') or str(template).endswith('\\tab07-activate.html'))
        and key.endswith('_activate')
        and key not in _TAB07_SKIP_SHARED
    )
    if _is_ac_tab:
        base_key = key[:-9] if key.endswith('_activate') else key  # strip '_activate'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # sessionStorage 키 prefix 매핑 (하드웨어 장비용)
        _STORAGE_PREFIX_MAP_AC = {
            'hw_server_onpremise':      'onpremise',
            'hw_server_cloud':          'cloud',
            'hw_server_frame':          'frame',
            'hw_server_workstation':    'workstation',
            'hw_storage_san':           'storage_san',
            'hw_storage_backup':        'storage_backup',
            'hw_san_director':          'san_director',
            'hw_san_switch':            'san_switch',
            'hw_network_l2':            'network_l2',
            'hw_network_l4':            'network_l4',
            'hw_network_l7':            'network_l7',
            'hw_network_ap':            'network_ap',
            'hw_network_dedicateline':  'network_circuit',
            'hw_security_firewall':     'SECURITY_FIREWALL',
            'hw_security_vpn':          'SECURITY_VPN',
            'hw_security_ids':          'SECURITY_IDS',
            'hw_security_ips':          'SECURITY_IPS',
            'hw_security_hsm':          'SECURITY_HSM',
            'hw_security_kms':          'SECURITY_KMS',
            'hw_security_wips':         'SECURITY_WIPS',
            'hw_security_etc':          'SECURITY_ETC',
        }
        _tab14_storage_prefix = _STORAGE_PREFIX_MAP_AC.get(base_key, '')

        # 소프트웨어 상세 페이지의 storage_prefix 추론
        if not _tab14_storage_prefix and str(base_key).startswith('sw_'):
            _sw_parts = base_key.split('_')
            _tab14_storage_prefix = '_'.join(_sw_parts[1:]) if len(_sw_parts) > 1 else base_key

        # 탭 네비게이션 자동 생성
        tab_specs_ac = [
            ('_detail', '기본정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_basic', '구성정보'),
            ('_assign', '할당정보'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs_ac:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 하드웨어 상세: 목록 돌아가기 텍스트
        if str(base_key).startswith(('cat_hw_', 'hw_')):
            back_label = '목록으로 돌아가기'

        template = 'layouts/tab07-activate-shared.html'

    # ── tab95 컴포넌트 탭 공통 템플릿 ────────────────────────────────────
    # 기존 tab45-component.html 9개 파일을 단일 공유 템플릿으로 라우팅한다.
    # 페이지별 차이는 프리셋(data-preset) + 컨텍스트 변수로 주입.
    _is_tab95 = str(template).replace('\\', '/').endswith('/tab45-component.html')
    if _is_tab95:
        if key.endswith('_component'):
            base_key = key[:-len('_component')]
        elif key.endswith('_system'):
            base_key = key[:-len('_system')]
        else:
            base_key = key
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        _tab95_all_specs = [
            ('_detail', '기본정보'),
            ('_manager', '담당자'),
            ('_system', '시스템'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '컴포넌트'),
            ('_sla', 'SLA'),
            ('_issue', '이슈관리'),
            ('_task', '작업이력'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in _tab95_all_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        _t95_preset = 'comp-model'
        _t95_section_title = '모델별 컴포넌트'
        _t95_analytics_title = '컴포넌트 통계 분석'
        _t95_analytics_subtitle = '구분별 유형 분포'
        _t95_empty_title = '컴포넌트 항목이 없습니다.'
        _t95_empty_desc = '해당 모델과 일치하는 컴포넌트 자산이 없습니다.'
        _t95_file_prefix = 'component_'
        _t95_api_endpoint = ''
        _t95_session_key = ''
        _t95_storage_key = 'comp-model:pageSize'
        _t95_show_analytics = 'true'

        if str(base_key).startswith('cat_component_'):
            _comp_tab_order = ('_detail', '_system', '_task', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_comp_tab_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_comp_tab_order) if t['key'].endswith(s)), 99))
            for t in tabs:
                if t['key'].endswith('_system'):
                    t['label'] = '컴포넌트'
            back_label = '목록으로 돌아가기'
            _t95_preset = 'comp-model'
            _t95_section_title = '모델별 컴포넌트'
            _t95_analytics_title = '컴포넌트 통계 분석'
            _t95_analytics_subtitle = '구분별 유형 분포'
            _t95_empty_title = '컴포넌트 항목이 없습니다.'
            _t95_empty_desc = '해당 모델과 일치하는 컴포넌트 자산이 없습니다.'
            _t95_api_endpoint = '/api/category/comp-model-assets?model={id}'
            _t95_storage_key = 'comp-model:pageSize'
            _t95_file_prefix = '컴포넌트_자산_'
        elif base_key == 'cat_vendor_manufacturer':
            _vendor_tab_order = ('_detail', '_manager', '_hardware', '_software', '_component', '_task', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_vendor_tab_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_vendor_tab_order) if t['key'].endswith(s)), 99))
            back_label = '목록으로 돌아가기'
            _t95_preset = 'vendor-manufacturer'
            _t95_section_title = '제조사 컴포넌트'
            _t95_analytics_title = '컴포넌트 통계 분석'
            _t95_analytics_subtitle = '구분별 모델명 분포'
            _t95_empty_title = '컴포넌트 항목이 없습니다.'
            _t95_empty_desc = '해당 제조사와 일치하는 컴포넌트 자산이 없습니다.'
            _t95_api_endpoint = '/api/vendor-manufacturers/{id}/comp-assets'
            _t95_session_key = 'manufacturer:context'
            _t95_storage_key = 'vendor:co-assets:pageSize'
            _t95_file_prefix = 'manufacturer_component_assets_'
        elif base_key == 'cat_vendor_maintenance':
            _maint_tab_order = ('_detail', '_manager', '_hardware', '_software', '_component', '_sla', '_issue', '_task', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_maint_tab_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_maint_tab_order) if t['key'].endswith(s)), 99))
            back_label = '목록으로 돌아가기'
            _t95_preset = 'vendor-maintenance'
            _t95_section_title = '유지보수사 컴포넌트'
            _t95_analytics_title = '컴포넌트 통계 분석'
            _t95_analytics_subtitle = '구분별 모델명 분포'
            _t95_empty_title = '컴포넌트 항목이 없습니다.'
            _t95_empty_desc = '해당 유지보수사와 일치하는 OPEX 컴포넌트 계약이 없습니다.'
            _t95_api_endpoint = '/api/vendor-maintenance/{id}/comp-assets'
            _t95_session_key = 'maintenance:context'
            _t95_storage_key = 'maint:comp-assets:pageSize'
            _t95_file_prefix = 'maintenance_comp_'

        _tab95_context = {
            'tab95_preset':             _t95_preset,
            'tab95_section_title':      _t95_section_title,
            'tab95_analytics_title':    _t95_analytics_title,
            'tab95_analytics_subtitle': _t95_analytics_subtitle,
            'tab95_empty_title':        _t95_empty_title,
            'tab95_empty_desc':         _t95_empty_desc,
            'tab95_file_prefix':        _t95_file_prefix,
            'tab95_api_endpoint':       _t95_api_endpoint,
            'tab95_session_key':        _t95_session_key,
            'tab95_storage_key':        _t95_storage_key,
            'tab95_show_analytics':     _t95_show_analytics,
        }

        template = 'layouts/tab95-component-shared.html'

    # ── tab91 시스템/자산 탭 공통 템플릿 ─────────────────────────────────
    # 기존 tab41-system 을 단일 공유 템플릿(tab91-system-shared.html)으로 라우팅한다.
    # (tab43-hardware → tab93-hardware-shared.html 로 분리됨)
    # (tab44-software → tab94-software-shared.html 로 분리됨)
    # (tab45-component → tab95-component-shared.html 로 분리됨)
    # 페이지별 차이는 프리셋(data-preset) + 컨텍스트 변수로 주입.
    _TAB91_SKIP_SHARED = set()  # 필요시 특정 키 제외
    _tab91_template_names = (
        '/tab41-system.html',
    )
    _is_tab91 = (
        any(str(template).replace('\\', '/').endswith(s) for s in _tab91_template_names)
        and key not in _TAB91_SKIP_SHARED
    )
    if _is_tab91:
        # 라우트 키에서 base_key 파생
        _t91_suffix = None
        for _sf in ('_system', '_software', '_component'):
            if key.endswith(_sf):
                _t91_suffix = _sf
                break
        if not _t91_suffix:
            _t91_suffix = '_system'
        base_key = key[:-len(_t91_suffix)]
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # 탭 네비게이션 빌드 (전체 도메인 공통 스펙)
        _tab91_specs = [
            ('_detail', '기본정보'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_contract', '계약정보'),
            ('_hw', '하드웨어'),
            ('_sw', '소프트웨어'),
            ('_backup', '백업정책'),
            ('_if', '인터페이스'),
            ('_zone', '존 구성'),
            ('_account', '계정관리'),
            ('_authority', '권한관리'),
            ('_activate', '기동절차'),
            ('_firewalld', '방화벽'),
            ('_storage', '스토리지'),
            ('_task', '작업이력'),
            ('_vulnerability', '취약점'),
            ('_package', '패키지'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '부품'),
            ('_ip_range', 'IP 범위'),
            ('_communication', '통신현황'),
            ('_vpn_policy', 'VPN 정책'),
            ('_domain', '도메인 관리'),
            ('_dns_record', '레코드'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in _tab91_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # ── 기본 프리셋/설정값 ──
        _t91_preset = 'workgroup-system'
        _t91_section_title = '시스템'
        _t91_analytics_title = '시스템 통계 분석'
        _t91_analytics_subtitle = '구분별 유형 분포'
        _t91_empty_title = '시스템 항목이 없습니다.'
        _t91_empty_desc = '-'
        _t91_file_prefix = 'system_'
        _t91_api_base = ''
        _t91_api_suffix = ''
        _t91_entity_id = ''
        _t91_storage_key = ''

        # ── 도메인별 프리셋 오버라이드 ──

        # 업무 그룹 > 시스템
        if base_key == 'cat_business_group':
            _wg_order = ('_detail', '_manager', '_system', '_service', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_wg_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_wg_order) if t['key'].endswith(s)), 99))
            back_label = '목록으로 돌아가기'
            _t91_preset = 'workgroup-system'
            _t91_section_title = '시스템'
            _t91_analytics_title = '시스템 통계 분석'
            _t91_analytics_subtitle = '구분별 유형 분포'
            _t91_empty_title = '시스템 항목이 없습니다.'
            _t91_api_base = '/api/work-groups'
            _t91_api_suffix = '/systems'
            _t91_storage_key = 'wg:system:pageSize'
            _t91_file_prefix = 'workgroup_system_'

        # 소프트웨어 카테고리 > 소프트웨어 (시스템 탭에 소프트웨어 라벨)
        elif str(base_key).startswith('cat_sw_'):
            for tab in tabs:
                if tab['key'].endswith('_system'):
                    tab['label'] = '소프트웨어'
            tabs = [t for t in tabs if t['key'].endswith(('_detail', '_system', '_log', '_file'))]
            back_label = '목록으로 돌아가기'
            _t91_preset = 'vendor-software'
            _t91_section_title = '소프트웨어'
            _t91_analytics_title = '소프트웨어 통계 분석'
            _t91_analytics_subtitle = '구분별 유형 · 모델명 분포'
            _t91_empty_title = '소프트웨어 항목이 없습니다.'
            _t91_empty_desc = '해당 소프트웨어와 일치하는 자산이 없습니다.'
            _t91_api_base = '/api/vendor-manufacturers'
            _t91_api_suffix = '/sw-assets'
            _t91_storage_key = 'vendor:sw-assets:pageSize'
            _t91_file_prefix = 'vendor_software_'

        # 컴포넌트 카테고리 > 컴포넌트 (시스템 탭에 컴포넌트 라벨)
        elif str(base_key).startswith('cat_component_'):
            for tab in tabs:
                if tab['key'].endswith('_system'):
                    tab['label'] = '컴포넌트'
            tabs = [t for t in tabs if t['key'].endswith(('_detail', '_system', '_log', '_file'))]
            back_label = '목록으로 돌아가기'
            _t91_preset = 'vendor-component'
            _t91_section_title = '컴포넌트'
            _t91_analytics_title = '컴포넌트 통계 분석'
            _t91_analytics_subtitle = '구분별 모델 분포'
            _t91_empty_title = '컴포넌트 항목이 없습니다.'
            _t91_empty_desc = '해당 컴포넌트와 일치하는 자산이 없습니다.'
            _t91_api_base = '/api/vendor-manufacturers'
            _t91_api_suffix = '/comp-assets'
            _t91_storage_key = 'vendor:comp-assets:pageSize'
            _t91_file_prefix = 'vendor_component_'

        # 제조사 > 소프트웨어 (하드웨어는 tab93 블록에서 처리)
        elif str(base_key).startswith('cat_vendor_') and _t91_suffix == '_software':
            _vendor_tab_order = ('_detail', '_manager', '_hardware', '_software', '_component', '_task', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_vendor_tab_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_vendor_tab_order) if t['key'].endswith(s)), 99))
            back_label = '목록으로 돌아가기'
            _t91_preset = 'vendor-software'
            _t91_section_title = '제조사 소프트웨어'
            _t91_analytics_title = '소프트웨어 통계 분석'
            _t91_analytics_subtitle = '구분별 유형 · 모델명 분포'
            _t91_empty_title = '소프트웨어 항목이 없습니다.'
            _t91_empty_desc = '해당 제조사와 일치하는 소프트웨어 자산이 없습니다.'
            _t91_api_base = '/api/vendor-manufacturers'
            _t91_api_suffix = '/sw-assets'
            _t91_storage_key = 'vendor:sw-assets:pageSize'
            _t91_file_prefix = 'vendor_software_'

        # 제조사 > 컴포넌트
        elif str(base_key).startswith('cat_vendor_') and _t91_suffix == '_component':
            _vendor_tab_order = ('_detail', '_manager', '_hardware', '_software', '_component', '_task', '_log', '_file')
            tabs = [t for t in tabs if t['key'].endswith(_vendor_tab_order)]
            tabs.sort(key=lambda t: next((i for i, s in enumerate(_vendor_tab_order) if t['key'].endswith(s)), 99))
            back_label = '목록으로 돌아가기'
            _t91_preset = 'vendor-component'
            _t91_section_title = '제조사 컴포넌트'
            _t91_analytics_title = '컴포넌트 통계 분석'
            _t91_analytics_subtitle = '구분별 모델 분포'
            _t91_empty_title = '컴포넌트 항목이 없습니다.'
            _t91_empty_desc = '해당 제조사와 일치하는 컴포넌트 자산이 없습니다.'
            _t91_api_base = '/api/vendor-manufacturers'
            _t91_api_suffix = '/comp-assets'
            _t91_storage_key = 'vendor:comp-assets:pageSize'
            _t91_file_prefix = 'vendor_component_'

        # (하드웨어 카테고리는 tab93 블록에서 처리)

        # 컨텍스트 변수 주입
        _tab91_context = {
            'tab91_preset':             _t91_preset,
            'tab91_section_title':      _t91_section_title,
            'tab91_analytics_title':    _t91_analytics_title,
            'tab91_analytics_subtitle': _t91_analytics_subtitle,
            'tab91_empty_title':        _t91_empty_title,
            'tab91_empty_desc':         _t91_empty_desc,
            'tab91_file_prefix':        _t91_file_prefix,
            'tab91_api_base':           _t91_api_base,
            'tab91_api_suffix':         _t91_api_suffix,
            'tab91_entity_id':          _t91_entity_id,
            'tab91_storage_key':        _t91_storage_key,
        }

        template = 'layouts/tab91-system-shared.html'

    # VPN detail/tab pages: allow deep-linking with asset_id in the query.
    # The client JS will immediately move it to storage and strip the query via history.replaceState.
    # (We avoid server-side redirect here because it can lose context depending on session/cookie settings.)
    # 상세/탭 페이지의 기본 타이틀 & 서브타이틀 (간단한 데모 값; 추후 DB 연동 가능)
    DETAIL_META = {
        # Governance IP policy meta (detail + tabs)
        'gov_ip_policy_detail': ('IP POLICY', 'Network IP Range Management'),
        'gov_ip_policy_ip_range': ('IP POLICY', 'Network IP Range Management'),
        'gov_ip_policy_log': ('IP POLICY', 'Network IP Range Management'),
        'gov_ip_policy_file': ('IP POLICY', 'Network IP Range Management'),
        # Governance DNS policy meta (detail + tabs)
        'gov_dns_policy_detail': ('DNS POLICY', 'Network DNS Policy Management'),
        'gov_dns_policy_dns_record': ('DNS POLICY', 'Network DNS Policy Management'),
        'gov_dns_policy_log': ('DNS POLICY', 'Network DNS Policy Management'),
        'gov_dns_policy_file': ('DNS POLICY', 'Network DNS Policy Management'),
        # Governance VPN policy meta (detail + tabs)
        'gov_vpn_policy_detail': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy_manager': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy_communication': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy_vpn_policy': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy_log': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy_file': ('VPN POLICY', 'VPN Policy Management'),
        # Governance VPN policy (vpn2) meta (detail + tabs)
        'gov_vpn_policy2_detail': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy2_manager': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy2_communication': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy2_vpn_policy': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy2_log': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy2_file': ('VPN POLICY', 'VPN Policy Management'),
        # Governance VPN policy (vpn3) meta (detail + tabs)
        'gov_vpn_policy3_detail': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy3_manager': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy3_communication': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy3_vpn_policy': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy3_log': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy3_file': ('VPN POLICY', 'VPN Policy Management'),
        # Governance VPN policy (vpn4) meta (detail + tabs)
        'gov_vpn_policy4_detail': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy4_manager': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy4_communication': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy4_vpn_policy': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy4_log': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy4_file': ('VPN POLICY', 'VPN Policy Management'),
        # Governance VPN policy (vpn5) meta (detail + tabs)
        'gov_vpn_policy5_detail': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy5_manager': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy5_communication': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy5_vpn_policy': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy5_log': ('VPN POLICY', 'VPN Policy Management'),
        'gov_vpn_policy5_file': ('VPN POLICY', 'VPN Policy Management'),
        # Dedicated Line Member meta (detail + tabs)
        'gov_dedicatedline_member_detail': ('DEDICATED LINE MEMBER', 'Dedicated Line Member Management'),
        'gov_dedicatedline_member_manager': ('DEDICATED LINE MEMBER', 'Dedicated Line Member Management'),
        'gov_dedicatedline_member_task': ('DEDICATED LINE MEMBER', 'Dedicated Line Member Management'),
        'gov_dedicatedline_member_log': ('DEDICATED LINE MEMBER', 'Dedicated Line Member Management'),
        'gov_dedicatedline_member_file': ('DEDICATED LINE MEMBER', 'Dedicated Line Member Management'),
        # Dedicated Line Customer meta (detail + tabs)
        'gov_dedicatedline_customer_detail': ('DEDICATED LINE CUSTOMER', 'Dedicated Line Customer Management'),
        'gov_dedicatedline_customer_manager': ('DEDICATED LINE CUSTOMER', 'Dedicated Line Customer Management'),
        'gov_dedicatedline_customer_task': ('DEDICATED LINE CUSTOMER', 'Dedicated Line Customer Management'),
        'gov_dedicatedline_customer_log': ('DEDICATED LINE CUSTOMER', 'Dedicated Line Customer Management'),
        'gov_dedicatedline_customer_file': ('DEDICATED LINE CUSTOMER', 'Dedicated Line Customer Management'),
        # Dedicated Line VAN meta (detail + tabs)
        'gov_dedicatedline_van_detail': ('DEDICATED LINE VAN', 'Dedicated Line VAN Management'),
        'gov_dedicatedline_van_manager': ('DEDICATED LINE VAN', 'Dedicated Line VAN Management'),
        'gov_dedicatedline_van_task': ('DEDICATED LINE VAN', 'Dedicated Line VAN Management'),
        'gov_dedicatedline_van_log': ('DEDICATED LINE VAN', 'Dedicated Line VAN Management'),
        'gov_dedicatedline_van_file': ('DEDICATED LINE VAN', 'Dedicated Line VAN Management'),
        # Dedicated Line Affiliate meta (detail + tabs)
        'gov_dedicatedline_affiliate_detail': ('DEDICATED LINE AFFILIATE', 'Dedicated Line Affiliate Management'),
        'gov_dedicatedline_affiliate_manager': ('DEDICATED LINE AFFILIATE', 'Dedicated Line Affiliate Management'),
        'gov_dedicatedline_affiliate_task': ('DEDICATED LINE AFFILIATE', 'Dedicated Line Affiliate Management'),
        'gov_dedicatedline_affiliate_log': ('DEDICATED LINE AFFILIATE', 'Dedicated Line Affiliate Management'),
        'gov_dedicatedline_affiliate_file': ('DEDICATED LINE AFFILIATE', 'Dedicated Line Affiliate Management'),
        # Dedicated Line Intranet meta (detail + tabs)
        'gov_dedicatedline_intranet_detail': ('DEDICATED LINE INTRANET', 'Dedicated Line Intranet Management'),
        'gov_dedicatedline_intranet_manager': ('DEDICATED LINE INTRANET', 'Dedicated Line Intranet Management'),
        'gov_dedicatedline_intranet_task': ('DEDICATED LINE INTRANET', 'Dedicated Line Intranet Management'),
        'gov_dedicatedline_intranet_log': ('DEDICATED LINE INTRANET', 'Dedicated Line Intranet Management'),
        'gov_dedicatedline_intranet_file': ('DEDICATED LINE INTRANET', 'Dedicated Line Intranet Management'),
        # Cost OPEX Hardware meta (detail + tabs)
        'cost_opex_hardware_detail': ('COST OPEX HARDWARE', 'OPEX Hardware Contract Management'),
        'cost_opex_hardware_contract': ('COST OPEX HARDWARE', 'OPEX Hardware Contract Management'),
        'cost_opex_hardware_log': ('COST OPEX HARDWARE', 'OPEX Hardware Contract Management'),
        'cost_opex_hardware_file': ('COST OPEX HARDWARE', 'OPEX Hardware Contract Management'),
        'cost_opex_software_detail': ('COST OPEX SOFTWARE', 'OPEX Software Contract Management'),
        'cost_opex_etc_detail': ('COST OPEX ETC', 'OPEX ETC Contract Management'),
        # Category Server meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_hw_server_detail': ('서버', 'Server Hardware'),
        'cat_hw_server_hardware': ('서버', 'Server Hardware'),
        'cat_hw_server_log': ('서버', 'Server Hardware'),
        'cat_hw_server_file': ('서버', 'Server Hardware'),
        # Category Storage meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_hw_storage_detail': ('스토리지', 'Storage Hardware'),
        'cat_hw_storage_hardware': ('스토리지', 'Storage Hardware'),
        'cat_hw_storage_log': ('스토리지', 'Storage Hardware'),
        'cat_hw_storage_file': ('스토리지', 'Storage Hardware'),
        # Category SAN meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_hw_san_detail': ('SAN', 'Storage Area Network'),
        'cat_hw_san_hardware': ('SAN', 'Storage Area Network'),
        'cat_hw_san_log': ('SAN', 'Storage Area Network'),
        'cat_hw_san_file': ('SAN', 'Storage Area Network'),
        # Category Network meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_hw_network_detail': ('네트워크', 'Network Hardware'),
        'cat_hw_network_hardware': ('네트워크', 'Network Hardware'),
        'cat_hw_network_log': ('네트워크', 'Network Hardware'),
        'cat_hw_network_file': ('네트워크', 'Network Hardware'),
        # Category Security meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_hw_security_detail': ('보안장비', 'Security Hardware'),
        'cat_hw_security_hardware': ('보안장비', 'Security Hardware'),
        'cat_hw_security_log': ('보안장비', 'Security Hardware'),
        'cat_hw_security_file': ('보안장비', 'Security Hardware'),
        # Category OS meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_sw_os_detail': ('운영체제', 'Operating System'),
        'cat_sw_os_system': ('운영체제', 'Operating System'),
        'cat_sw_os_task': ('운영체제', 'Operating System'),
        'cat_sw_os_log': ('운영체제', 'Operating System'),
        'cat_sw_os_file': ('운영체제', 'Operating System'),
        # Category Database meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_sw_database_detail': ('데이터베이스', 'Database Software'),
        'cat_sw_database_system': ('데이터베이스', 'Database Software'),
        'cat_sw_database_task': ('데이터베이스', 'Database Software'),
        'cat_sw_database_log': ('데이터베이스', 'Database Software'),
        'cat_sw_database_file': ('데이터베이스', 'Database Software'),
        # Category Middleware meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_sw_middleware_detail': ('미들웨어', 'Middleware Software'),
        'cat_sw_middleware_system': ('미들웨어', 'Middleware Software'),
        'cat_sw_middleware_task': ('미들웨어', 'Middleware Software'),
        'cat_sw_middleware_log': ('미들웨어', 'Middleware Software'),
        'cat_sw_middleware_file': ('미들웨어', 'Middleware Software'),
        # Category Virtualization meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_sw_virtualization_detail': ('가상화', 'Virtualization Software'),
        'cat_sw_virtualization_system': ('가상화', 'Virtualization Software'),
        'cat_sw_virtualization_task': ('가상화', 'Virtualization Software'),
        'cat_sw_virtualization_log': ('가상화', 'Virtualization Software'),
        'cat_sw_virtualization_file': ('가상화', 'Virtualization Software'),
        # Category Security meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_sw_security_detail': ('보안S/W', 'Security Software'),
        'cat_sw_security_system': ('보안S/W', 'Security Software'),
        'cat_sw_security_task': ('보안S/W', 'Security Software'),
        'cat_sw_security_log': ('보안S/W', 'Security Software'),
        'cat_sw_security_file': ('보안S/W', 'Security Software'),
        # Category High Availability meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_sw_high_availability_detail': ('고가용성', 'High Availability Software'),
        'cat_sw_high_availability_system': ('고가용성', 'High Availability Software'),
        'cat_sw_high_availability_task': ('고가용성', 'High Availability Software'),
        'cat_sw_high_availability_log': ('고가용성', 'High Availability Software'),
        'cat_sw_high_availability_file': ('고가용성', 'High Availability Software'),
        # Category Component CPU meta (detail + tabs)
        'cat_component_cpu_detail': ('모델명', '제조사'),
        'cat_component_cpu_system': ('모델명', '제조사'),
        'cat_component_cpu_task': ('모델명', '제조사'),
        'cat_component_cpu_log': ('모델명', '제조사'),
        'cat_component_cpu_file': ('모델명', '제조사'),
        # Category Component GPU meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_component_gpu_detail': ('모델명', '제조사'),
        'cat_component_gpu_system': ('모델명', '제조사'),
        'cat_component_gpu_task': ('모델명', '제조사'),
        'cat_component_gpu_log': ('모델명', '제조사'),
        'cat_component_gpu_file': ('모델명', '제조사'),
        # Category Component MEMORY meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_component_memory_detail': ('모델명', '제조사'),
        'cat_component_memory_system': ('모델명', '제조사'),
        'cat_component_memory_task': ('모델명', '제조사'),
        'cat_component_memory_log': ('모델명', '제조사'),
        'cat_component_memory_file': ('모델명', '제조사'),
        # Category Component DISK meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_component_disk_detail': ('모델명', '제조사'),
        'cat_component_disk_system': ('모델명', '제조사'),
        'cat_component_disk_task': ('모델명', '제조사'),
        'cat_component_disk_log': ('모델명', '제조사'),
        'cat_component_disk_file': ('모델명', '제조사'),
        # Category Component NIC meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_component_nic_detail': ('모델명', '제조사'),
        'cat_component_nic_system': ('모델명', '제조사'),
        'cat_component_nic_task': ('모델명', '제조사'),
        'cat_component_nic_log': ('모델명', '제조사'),
        'cat_component_nic_file': ('모델명', '제조사'),
        # Category Component HBA meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_component_hba_detail': ('모델명', '제조사'),
        'cat_component_hba_system': ('모델명', '제조사'),
        'cat_component_hba_task': ('모델명', '제조사'),
        'cat_component_hba_log': ('모델명', '제조사'),
        'cat_component_hba_file': ('모델명', '제조사'),
        # Category Component ETC meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_component_etc_detail': ('모델명', '제조사'),
        'cat_component_etc_system': ('모델명', '제조사'),
        'cat_component_etc_task': ('모델명', '제조사'),
        'cat_component_etc_log': ('모델명', '제조사'),
        'cat_component_etc_file': ('모델명', '제조사'),
        # Category Vendor Manufacturer meta (detail + tabs) - static placeholders
        'cat_vendor_manufacturer_detail': ('제조사', 'Vendor Manufacturer'),
        'cat_vendor_manufacturer_manager': ('제조사', 'Vendor Manufacturer'),
        'cat_vendor_manufacturer_hardware': ('제조사', 'Vendor Manufacturer'),
        'cat_vendor_manufacturer_software': ('제조사', 'Vendor Manufacturer'),
        'cat_vendor_manufacturer_component': ('제조사', 'Vendor Manufacturer'),
        'cat_vendor_manufacturer_task': ('제조사', 'Vendor Manufacturer'),
        'cat_vendor_manufacturer_log': ('제조사', 'Vendor Manufacturer'),
        'cat_vendor_manufacturer_file': ('제조사', 'Vendor Manufacturer'),
        # Category Vendor Maintenance meta (detail + tabs) - static placeholders
        'cat_vendor_maintenance_detail': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_manager': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_hardware': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_software': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_component': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_sla': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_issue': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_task': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_log': ('유지보수사', 'Vendor Maintenance'),
        'cat_vendor_maintenance_file': ('유지보수사', 'Vendor Maintenance'),
        # Category Customer detail + tabs meta (static placeholders)
        'cat_customer_client1_detail': ('고객', '-'),
        'cat_customer_client1_manager': ('고객', '-'),
        'cat_customer_client1_task': ('고객', '-'),
        'cat_customer_client1_log': ('고객', '-'),
        'cat_customer_client1_file': ('고객', '-'),
        # Project Completed list detail + tabs meta (static placeholders; override 가능)
        'proj_completed_detail': (None, None),
        'proj_completed_integrity': (None, None),
        'proj_completed_scope': (None, None),
        'proj_completed_schedule': (None, None),
        'proj_completed_cost': (None, None),
        'proj_completed_quality': (None, None),
        'proj_completed_resource': (None, None),
        'proj_completed_communication': (None, None),
        'proj_completed_risk': (None, None),
        'proj_completed_procurement': (None, None),
        'proj_completed_stakeholder': (None, None),
        # Category Business Work Group meta (detail + tabs) - static placeholders; front-end overrides via sessionStorage/query
        'cat_business_group_detail': ('업무 그룹', 'Work Group'),
        'cat_business_group_manager': ('업무 그룹', 'Work Group'),
        'cat_business_group_system': ('업무 그룹', 'Work Group'),
        'cat_business_group_service': ('업무 그룹', 'Work Group'),
        'cat_business_group_task': ('업무 그룹', 'Work Group'),
        'cat_business_group_log': ('업무 그룹', 'Work Group'),
        'cat_business_group_file': ('업무 그룹', 'Work Group'),
    }
    title, subtitle = DETAIL_META.get(key, (None, None))
    # tab14-log 블록에서 설정한 title/subtitle을 DETAIL_META가 덮어쓰지 않도록 복원
    if title is None and _tab14_title:
        title = _tab14_title
    if subtitle is None and _tab14_subtitle:
        subtitle = _tab14_subtitle

    # -----------------------------------------------------------------------
    # Hardware detail: server-side title/subtitle from Flask session
    # Client JS syncs header data to Flask session (POST /api/_hw_session_sync)
    # after the first page load. Subsequent tab navigations read from session
    # so the template renders with real values (no flicker).
    # -----------------------------------------------------------------------
    _HW_BASE_KEYS = {
        'hw_server_onpremise', 'hw_server_cloud', 'hw_server_frame', 'hw_server_workstation',
        'hw_storage_storage', 'hw_storage_backup', 'hw_storage_ptl', 'hw_storage_san',
        'hw_san_director', 'hw_san_sansw', 'hw_san_switch',
        'hw_network_l2', 'hw_network_l4', 'hw_network_l7', 'hw_network_ap', 'hw_network_dedicateline',
        'hw_security_firewall', 'hw_security_vpn', 'hw_security_ids', 'hw_security_ips',
        'hw_security_hsm', 'hw_security_kms', 'hw_security_wips', 'hw_security_etc',
    }

    def _hw_base(k):
        for bk in sorted(_HW_BASE_KEYS, key=len, reverse=True):
            if k == bk or k.startswith(bk + '_'):
                return bk
        return None

    _hwb = _hw_base(key)
    if _hwb:
        # ── Query-param entry (VPN pattern): list JS passes ?asset_id= ──
        _hw_aid = (request.args.get('asset_id') or request.args.get('id') or '').strip()
        if _hw_aid:
            _hw_work = (request.args.get('work') or '').strip()
            _hw_sys  = (request.args.get('system') or '').strip()
            # DB fallback when title/subtitle not in query string
            if not _hw_work or not _hw_sys:
                try:
                    _ha = svc_get_hardware_asset(int(_hw_aid))
                    if _ha:
                        _hw_work = _hw_work or (_ha.get('work_name') or '')
                        _hw_sys  = _hw_sys  or (_ha.get('system_name') or '')
                except Exception:
                    pass
            _hw_ctx = session.get('hw_detail_ctx')
            if not isinstance(_hw_ctx, dict):
                _hw_ctx = {}
            _hw_ctx[_hwb] = {
                'title': _hw_work,
                'subtitle': _hw_sys,
                'id': _hw_aid,
            }
            session['hw_detail_ctx'] = _hw_ctx
            session.modified = True
            return redirect(url_for('pages.show', key=key), code=302)

        # ── No query params — read title/subtitle from session ──
        if title is None:
            _hw_raw = (session.get('hw_detail_ctx') or {}).get(_hwb)
            if isinstance(_hw_raw, dict):
                if _hw_raw.get('title'):
                    title = _hw_raw['title']
                if _hw_raw.get('subtitle'):
                    subtitle = _hw_raw['subtitle']

    # ── Expose asset context for tab05-account (JS needs scope + id) ──
    hw_asset_id = None
    hw_asset_scope = None
    if _hwb:
        _hw_acct_raw = (session.get('hw_detail_ctx') or {}).get(_hwb)
        if isinstance(_hw_acct_raw, dict) and _hw_acct_raw.get('id'):
            try:
                hw_asset_id = int(_hw_acct_raw['id'])
            except (TypeError, ValueError):
                hw_asset_id = None
            # Derive scope from base key: hw_server_onpremise -> onpremise
            hw_asset_scope = _hwb.rsplit('_', 1)[-1] if '_' in _hwb else _hwb

    db_detail = None
    os_detail = None
    middleware_detail = None
    virtualization_detail = None
    security_detail = None
    ha_detail = None

    COST_DETAIL_KEYS = {
        'cost_opex_hardware_detail',
        'cost_opex_hardware_contract',
        'cost_opex_hardware_log',
        'cost_opex_hardware_file',
        'cost_opex_software_detail',
        'cost_opex_software_contract',
        'cost_opex_software_log',
        'cost_opex_software_file',
        'cost_opex_etc_detail',
        'cost_opex_etc_contract',
        'cost_opex_etc_log',
        'cost_opex_etc_file',
        'cost_capex_hardware_detail',
        'cost_capex_hardware_contract',
        'cost_capex_hardware_log',
        'cost_capex_hardware_file',
        'cost_capex_software_detail',
        'cost_capex_software_contract',
        'cost_capex_software_log',
        'cost_capex_software_file',
        'cost_capex_etc_detail',
        'cost_capex_etc_contract',
        'cost_capex_etc_log',
        'cost_capex_etc_file',
    }

    detail_manage_no = None
    detail_token = None
    detail_entity_key = None
    detail_contract = None

    # Cost > OPEX contracts: do NOT expose manage_no (or token) in URL.
    # Canonical URLs are /p/<key> only; the selected manage_no is stored in session.
    # We still accept /p/<key>/<token> and ?id=<manage_no> for backward compatibility,
    # but they immediately set session context and redirect to /p/<key>.
    if key in COST_DETAIL_KEYS:
        def _cost_base_key(k: str) -> str:
            base = k
            for suf in ('_detail', '_system', '_contract', '_log', '_file'):
                if base.endswith(suf):
                    base = base[: -len(suf)]
                    break
            return base

        base_key = _cost_base_key(key)

        def _set_cost_ctx(manage_no: str) -> None:
            ctx = session.get('cost_detail_ctx_v1')
            if not isinstance(ctx, dict):
                ctx = {}
            ctx[base_key] = manage_no
            session['cost_detail_ctx_v1'] = ctx
            session.modified = True

        # 1) Legacy token path: decode token, store in session, redirect to clean URL.
        if token:
            detail_manage_no = decode_manage_no(token)
            if not detail_manage_no:
                return abort(404)
            _set_cost_ctx(detail_manage_no)
            # Preserve other query params but strip legacy id (if any)
            qs = request.args.to_dict(flat=False)
            qs.pop('id', None)
            flat_qs = {}
            for k, v in qs.items():
                if isinstance(v, (list, tuple)) and len(v) == 1:
                    flat_qs[k] = v[0]
                else:
                    flat_qs[k] = v
            return redirect(url_for('pages.show', key=key, **flat_qs), code=302)

        # 2) Legacy query param: store in session, redirect to clean URL.
        _manage_no = (request.args.get('id') or '').strip()
        if _manage_no:
            _set_cost_ctx(_manage_no)
            qs = request.args.to_dict(flat=False)
            qs.pop('id', None)
            flat_qs = {}
            for k, v in qs.items():
                if isinstance(v, (list, tuple)) and len(v) == 1:
                    flat_qs[k] = v[0]
                else:
                    flat_qs[k] = v
            return redirect(url_for('pages.show', key=key, **flat_qs), code=302)

        # 3) Canonical: resolve manage_no from session.
        try:
            ctx = session.get('cost_detail_ctx_v1')
            if isinstance(ctx, dict):
                detail_manage_no = (ctx.get(base_key) or '').strip() or None
        except Exception:
            detail_manage_no = None

        if not detail_manage_no:
            # No context: go back to list page for this base.
            return redirect(url_for('pages.show', key=base_key), code=302)

        subtitle = detail_manage_no
        try:
            def _type_from_base(bk: str) -> str | None:
                if bk.endswith('_hardware'):
                    return 'HW'
                if bk.endswith('_software'):
                    return 'SW'
                if bk.endswith('_etc'):
                    return 'ETC'
                return None

            contract_type = _type_from_base(base_key)
            manage_type_label = {
                'HW': '하드웨어',
                'SW': '소프트웨어',
                'ETC': '기타',
            }.get(contract_type or '', '-')

            if base_key.startswith('cost_opex_'):
                from ..services.opex_contract_service import get_opex_contract_by_manage_no as _get_by_no

                detail_contract = _get_by_no(detail_manage_no, opex_type=contract_type)
                if (not detail_contract) and contract_type:
                    detail_contract = _get_by_no(detail_manage_no, opex_type=None)
            elif base_key.startswith('cost_capex_'):
                from ..services.capex_contract_service import get_capex_contract_by_manage_no as _get_by_no

                detail_contract = _get_by_no(detail_manage_no, capex_type=contract_type)
                if (not detail_contract) and contract_type:
                    detail_contract = _get_by_no(detail_manage_no, capex_type=None)
            else:
                detail_contract = None

            if not isinstance(detail_contract, dict) or not detail_contract:
                detail_contract = {
                    'manage_no': detail_manage_no,
                    'contract_name': None,
                }
            detail_contract.setdefault('manage_no', detail_manage_no)
            detail_contract.setdefault('manage_type', manage_type_label)
            if detail_contract.get('contract_name'):
                title = detail_contract.get('contract_name')
        except Exception:
            detail_contract = {
                'manage_no': detail_manage_no,
            }
        if not title or (str(title).strip() in {'', '-'}):
            title = detail_contract.get('contract_name') or title
        try:
            detail_entity_key = f"cost:{base_key}:{detail_manage_no}"
        except Exception:
            detail_entity_key = None

        # OPEX detail pages: align basic-info aggregates with the tab61 '계약정보' tab.
        # - maint_qty_total: total rows in tab61 for current year
        # - maint_qty_active: rows whose contract_status == '계약'
        # - maint_amount: sum of tab61 line totals ("유지보수 합계") for current year
        # - maint_amount_display: comma-formatted amount for display
        try:
            if base_key.startswith('cost_opex_') and isinstance(detail_contract, dict):
                import datetime

                now_year = datetime.date.today().year
                cost_type = contract_type or ''
                scope = 'OPEX'

                def _format_int_like(v):
                    if v is None:
                        return None
                    if isinstance(v, (int, float)):
                        return f"{int(v):,}"
                    s = str(v).strip()
                    if not s:
                        return None
                    digits = ''.join(ch for ch in s if ch.isdigit() or ch == '-')
                    if digits in {'', '-'}:
                        return s
                    try:
                        return f"{int(digits):,}"
                    except Exception:
                        return s

                # Default to the contract's stored amount, but prefer tab61 sum when available.
                detail_contract['maint_amount_display'] = _format_int_like(detail_contract.get('maint_amount'))

                contract_pk = 0
                try:
                    contract_pk = int(detail_contract.get('id') or 0)
                except Exception:
                    contract_pk = 0

                total_cnt = 0
                active_cnt = 0
                tab61_sum_total = None
                if contract_pk > 0 and cost_type:
                    from ..services.cost_contract_tab61_service import list_tab61_lines as _list_tab61

                    lines = _list_tab61(scope=scope, cost_type=cost_type, contract_id=contract_pk, year=now_year)
                    if isinstance(lines, list):
                        total_cnt = len(lines)
                        active_cnt = sum(1 for it in lines if (it or {}).get('contract_status') == '계약')
                        try:
                            tab61_sum_total = sum(int((it or {}).get('sum') or 0) for it in lines)
                        except Exception:
                            tab61_sum_total = None
                # tab61 aggregates are the source of truth for qty display.
                detail_contract['maint_qty_total'] = total_cnt
                detail_contract['maint_qty_active'] = active_cnt

                if tab61_sum_total is not None:
                    detail_contract['maint_amount'] = int(tab61_sum_total)
                    detail_contract['maint_amount_display'] = _format_int_like(detail_contract.get('maint_amount'))
        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Governance detail pages — unified session-based routing
    # Canonical URL is /p/<key> only (no query params).
    # Context is stored in session['gov_detail_ctx_v1'].
    # Legacy query params → store in session, then redirect to clean URL.
    # -----------------------------------------------------------------------
    import re as _re_gov

    def _is_gov_detail_key(k: str) -> bool:
        if not k.startswith('gov_'):
            return False
        if _re_gov.match(r'^gov_ip_policy_(detail|ip_range|log|file)$', k):
            return True
        if _re_gov.match(r'^gov_dns_policy_(detail|dns_record|log|file)$', k):
            return True
        if _re_gov.match(r'^gov_vpn_policy\d?_(detail|manager|communication|vpn_policy|task|log|file)$', k):
            return True
        if _re_gov.match(r'^gov_ad_policy_(detail|domain|account|log|file)$', k):
            return True
        if _re_gov.match(r'^gov_dedicatedline_(member|customer|van|affiliate|intranet)_(detail|manager|task|log|file)$', k):
            return True
        return False

    def _gov_base_key_py(k: str) -> str:
        m = _re_gov.match(r'^(gov_ip_policy)_', k)
        if m:
            return m.group(1)
        m = _re_gov.match(r'^(gov_dns_policy)_', k)
        if m:
            return m.group(1)
        m = _re_gov.match(r'^(gov_vpn_policy\d?)_', k)
        if m:
            return m.group(1)
        m = _re_gov.match(r'^(gov_ad_policy)_', k)
        if m:
            return m.group(1)
        m = _re_gov.match(r'^(gov_dedicatedline_(?:member|customer|van|affiliate|intranet))_', k)
        if m:
            return m.group(1)
        return k

    def _gov_list_key(base: str) -> str:
        """Return the sidebar/list page key for a given governance base key."""
        if base == 'gov_ip_policy':
            return 'gov_ip_policy'
        if base == 'gov_dns_policy':
            return 'gov_dns_policy'
        m = _re_gov.match(r'^gov_vpn_policy(\d?)$', base)
        if m:
            return 'gov_vpn_policy' + (m.group(1) or '')
        if base == 'gov_ad_policy':
            return 'gov_ad_policy'
        m = _re_gov.match(r'^gov_dedicatedline_(member|customer|van|affiliate|intranet)$', base)
        if m:
            return 'gov_dedicatedline_' + m.group(1)
        return base

    _gov_sess = {}
    if _is_gov_detail_key(key):
        _gb = _gov_base_key_py(key)

        # Collect possible ID query params
        _gov_id = ''
        for _gp in ('vpn_line_id', 'line_id', 'policy_id', 'id'):
            _gv = (request.args.get(_gp) or '').strip()
            if _gv:
                _gov_id = _gv
                break

        _gov_title = (request.args.get('org_name') or request.args.get('title') or '').strip()
        _gov_subtitle = (
            request.args.get('protocol')
            or request.args.get('protocol_code')
            or request.args.get('subtitle')
            or ''
        ).strip()

        if _gov_id:
            # Store in session and redirect to clean URL
            _ctx = session.get('gov_detail_ctx_v1')
            if not isinstance(_ctx, dict):
                _ctx = {}
            _ctx[_gb] = {
                'id': _gov_id,
                'title': _gov_title,
                'subtitle': _gov_subtitle,
            }
            session['gov_detail_ctx_v1'] = _ctx
            session.modified = True
            return redirect(url_for('pages.show', key=key), code=302)

        # No query params — read from session
        _raw = (session.get('gov_detail_ctx_v1') or {}).get(_gb)
        if isinstance(_raw, dict):
            _gov_sess = _raw
        if not _gov_sess.get('id'):
            # No context available → redirect to list page
            return redirect(url_for('pages.show', key=_gov_list_key(_gb)), code=302)

    # Governance > IP 정책(4-3-1): Title=정책명, Subtitle=IP범위
    if key in {
        'gov_ip_policy_detail', 'gov_ip_policy_ip_range',
        'gov_ip_policy_log', 'gov_ip_policy_file',
    }:
        # Clear DETAIL_META placeholders
        if (title or '').strip().upper() == 'IP POLICY':
            title = None
        if (subtitle or '').strip() in {'-', 'Network IP Range Management'}:
            subtitle = None
        # 1) Session context
        _ip_title = (_gov_sess.get('title') or '').strip()
        _ip_subtitle = (_gov_sess.get('subtitle') or '').strip()
        if _ip_title:
            title = _ip_title
        if _ip_subtitle:
            subtitle = _ip_subtitle
        # 2) DB fallback using session ID
        if (not title or not subtitle) and _gov_sess.get('id'):
            try:
                from ..services.network_ip_policy_service import get_network_ip_policy as _get_ip_pol
                _ip_rec = _get_ip_pol(int(_gov_sess['id']))
                if _ip_rec:
                    if not title:
                        _start = (_ip_rec.get('start_ip') or '').strip()
                        _end = (_ip_rec.get('end_ip') or '').strip()
                        title = f'{_start} ~ {_end}'.strip(' ~') if _start else (_ip_rec.get('policy_name') or '')
                    if not subtitle:
                        subtitle = (_ip_rec.get('role') or _ip_rec.get('center_code') or '').strip()
            except Exception:
                pass
        title = title or 'IP 정책'
        subtitle = subtitle or '-'

    # Governance > DNS 정책(4-3-2): Title=도메인명, Subtitle=역할
    if key in {
        'gov_dns_policy_detail', 'gov_dns_policy_dns_record',
        'gov_dns_policy_log', 'gov_dns_policy_file',
    }:
        if (title or '').strip().upper() == 'DNS POLICY':
            title = None
        if (subtitle or '').strip() in {'-', 'Network DNS Policy Management'}:
            subtitle = None
        _dns_title = (_gov_sess.get('title') or '').strip()
        _dns_subtitle = (_gov_sess.get('subtitle') or '').strip()
        if _dns_title:
            title = _dns_title
        if _dns_subtitle:
            subtitle = _dns_subtitle
        if (not title or not subtitle) and _gov_sess.get('id'):
            try:
                from ..services.network_dns_policy_service import get_network_dns_policy as _get_dns_pol
                _dns_rec = _get_dns_pol(int(_gov_sess['id']))
                if _dns_rec:
                    if not title:
                        title = (_dns_rec.get('domain') or '').strip()
                    if not subtitle:
                        subtitle = (_dns_rec.get('role') or '').strip()
            except Exception:
                pass
        title = title or 'DNS 정책'
        subtitle = subtitle or '-'

    # Governance > VPN 정책(4-4-*): Title=기관명, Subtitle=프로토콜
    # Keep it server-rendered (cat_sw_os_detail pattern) to avoid header flicker during tab navigation.
    if key in {
        # VPN1 (대외계)
        'gov_vpn_policy_detail',
        'gov_vpn_policy_manager',
        'gov_vpn_policy_communication',
        'gov_vpn_policy_vpn_policy',
        'gov_vpn_policy_log',
        'gov_vpn_policy_file',
        # VPN2 (대외온라인)
        'gov_vpn_policy2_detail',
        'gov_vpn_policy2_manager',
        'gov_vpn_policy2_communication',
        'gov_vpn_policy2_vpn_policy',
        'gov_vpn_policy2_log',
        'gov_vpn_policy2_file',
        # VPN3 (우리카드)
        'gov_vpn_policy3_detail',
        'gov_vpn_policy3_manager',
        'gov_vpn_policy3_communication',
        'gov_vpn_policy3_vpn_policy',
        'gov_vpn_policy3_log',
        'gov_vpn_policy3_file',
        # VPN4 (직승인)
        'gov_vpn_policy4_detail',
        'gov_vpn_policy4_manager',
        'gov_vpn_policy4_communication',
        'gov_vpn_policy4_vpn_policy',
        'gov_vpn_policy4_log',
        'gov_vpn_policy4_file',
        # VPN5 (공중망)
        'gov_vpn_policy5_detail',
        'gov_vpn_policy5_manager',
        'gov_vpn_policy5_communication',
        'gov_vpn_policy5_vpn_policy',
        'gov_vpn_policy5_log',
        'gov_vpn_policy5_file',
    }:
        # Ignore static placeholders from DETAIL_META; we'll resolve dynamically (session/query/DB).
        if (title or '').strip().upper() == 'VPN POLICY':
            title = None
        if (subtitle or '').strip() in {'-', 'VPN Policy Management'}:
            subtitle = None

        # 1) Session context (SPA tab navigation)
        org_name = (_gov_sess.get('title') or '').strip()
        protocol = (_gov_sess.get('subtitle') or '').strip()
        if org_name:
            title = org_name
        if protocol:
            subtitle = protocol

        # 2) Query params (legacy / first visit — will be redirected by session block above)
        _qp_org = (request.args.get('org_name') or '').strip()
        _qp_proto = (request.args.get('protocol') or '').strip()
        if _qp_org:
            title = _qp_org
        if _qp_proto:
            subtitle = _qp_proto

        # 3) If still missing, resolve from DB using vpn_line_id
        if (not title or not subtitle):
            raw_line_id = (
                _gov_sess.get('id') or ''
            )
            raw_line_id = str(raw_line_id).strip()
            if raw_line_id:
                try:
                    line_id = int(raw_line_id)
                except Exception:
                    line_id = None
                if line_id:
                    try:
                        row = NetVpnLine.query.filter(NetVpnLine.id == line_id).first()
                    except Exception:
                        row = None
                    if row:
                        if not title:
                            try:
                                title = (row.partner.org_name if row.partner else None) or title
                            except Exception:
                                pass
                        if not subtitle:
                            try:
                                subtitle = (row.protocol or None) or subtitle
                            except Exception:
                                pass

        # Final placeholders (match UI language; avoids flashing wrong text like 'VPN POLICY')
        title = title or '기관명'
        subtitle = subtitle or '프로토콜'

    # -----------------------------------------------------------------------
    # Category detail pages — unified session-based routing
    # Canonical URL is /p/<key> only (no query params).
    # Context is stored in session['cat_detail_ctx_v1'].
    # Legacy query params → store in session, then redirect to clean URL.
    # -----------------------------------------------------------------------
    _CAT_TAB_SUFFIXES_PY = ('_detail', '_system', '_manager', '_service', '_task', '_log',
                            '_file', '_hardware', '_software', '_component',
)

    def _is_cat_tab_key(k: str) -> bool:
        if not k.startswith('cat_'):
            return False
        return any(k.endswith(s) for s in _CAT_TAB_SUFFIXES_PY)

    def _cat_base_key(k: str) -> str:
        for s in _CAT_TAB_SUFFIXES_PY:
            if k.endswith(s):
                return k[: -len(s)]
        return k

    # Typed ID query params per SW / business category
    _SW_ID_PARAMS = {
        'cat_sw_os': 'os_id',
        'cat_sw_database': 'db_id',
        'cat_sw_middleware': 'middleware_id',
        'cat_sw_virtualization': 'virtual_id',
        'cat_sw_security': 'security_id',
        'cat_sw_high_availability': 'ha_id',
        'cat_business_group': 'group_id',
    }

    # Vendor detail keys — defined early so the category block can exclude them
    VENDOR_DETAIL_KEYS = {
        'cat_vendor_manufacturer_detail',
        'cat_vendor_manufacturer_manager',
        'cat_vendor_manufacturer_hardware',
        'cat_vendor_manufacturer_software',
        'cat_vendor_manufacturer_component',
        'cat_vendor_manufacturer_task',
        'cat_vendor_manufacturer_log',
        'cat_vendor_manufacturer_file',
        'cat_vendor_maintenance_detail',
        'cat_vendor_maintenance_manager',
        'cat_vendor_maintenance_hardware',
        'cat_vendor_maintenance_software',
        'cat_vendor_maintenance_component',
        'cat_vendor_maintenance_sla',
        'cat_vendor_maintenance_issue',
        'cat_vendor_maintenance_task',
        'cat_vendor_maintenance_log',
        'cat_vendor_maintenance_file',
    }

    # Session context for category detail pages (accessible below)
    _cat_sess = {}

    # cat_vendor_maintenance is a LIST page, not a tab — exclude it
    if _is_cat_tab_key(key) and key not in VENDOR_DETAIL_KEYS and key != 'cat_vendor_maintenance':
        _cb = _cat_base_key(key)
        _id_param = _SW_ID_PARAMS.get(_cb, 'id')

        _qp_id = (request.args.get(_id_param) or request.args.get('id') or '').strip()
        _qp_model = (request.args.get('model') or request.args.get('wc_name') or '').strip()
        _qp_vendor = (request.args.get('vendor') or request.args.get('wc_desc') or '').strip()
        # Also capture additional HW params
        _qp_extra = {}
        for _ep in ('hw_type', 'release_date', 'eosl', 'qty', 'note', 'server_code'):
            _ev = (request.args.get(_ep) or '').strip()
            if _ev:
                _qp_extra[_ep] = _ev

        if _qp_id or _qp_model:
            # Store in session and redirect to clean URL
            _ctx = session.get('cat_detail_ctx_v1')
            if not isinstance(_ctx, dict):
                _ctx = {}
            _ctx[_cb] = {
                'id': _qp_id,
                'title': _qp_model,
                'subtitle': _qp_vendor,
                **_qp_extra,
            }
            session['cat_detail_ctx_v1'] = _ctx
            session.modified = True
            return redirect(url_for('pages.show', key=key), code=302)

        # No query params — read from session
        _cat_sess = {}
        try:
            _raw = (session.get('cat_detail_ctx_v1') or {}).get(_cb)
            if isinstance(_raw, dict):
                _cat_sess = _raw
        except Exception:
            pass

        if not _cat_sess.get('id') and not _cat_sess.get('title'):
            # No context — redirect to list
            return redirect(url_for('pages.show', key=_cb), code=302)

    # Category > Hardware detail pages (Server / Storage / SAN / Network / Security)
    # Title: model name, Subtitle: vendor name — resolved from session
    _HW_DETAIL_KEYS = {
        'cat_hw_server', 'cat_hw_storage', 'cat_hw_san',
        'cat_hw_network', 'cat_hw_security',
    }
    # Category > Component detail pages (CPU / GPU / Memory / Disk / NIC / HBA / ETC)
    _COMPONENT_DETAIL_KEYS = {
        'cat_component_cpu', 'cat_component_gpu', 'cat_component_memory',
        'cat_component_disk', 'cat_component_nic', 'cat_component_hba',
        'cat_component_etc',
    }
    _hw_id_for_ctx = ''
    _server_code_for_ctx = ''
    _hw_extra_for_ctx = {}          # hw_type, release_date, eosl, qty, note
    if _is_cat_tab_key(key):
        _simple_base = _cat_base_key(key)
        if _simple_base in _HW_DETAIL_KEYS or _simple_base in _COMPONENT_DETAIL_KEYS:
            title = _cat_sess.get('title', '') or '모델명'
            subtitle = _cat_sess.get('subtitle', '') or '제조사'
            # Expose the hardware row id and server_code so tab43-hardware can query by it
            _hw_id_for_ctx = _cat_sess.get('id', '')
            _server_code_for_ctx = _cat_sess.get('server_code', '')
            # Extra HW params for basic info section
            for _ep in ('hw_type', 'release_date', 'eosl', 'qty', 'note'):
                _ev = _cat_sess.get(_ep, '')
                if _ev:
                    _hw_extra_for_ctx[_ep] = _ev

            # DB refresh: always read fresh data so edits are reflected after tab navigation
            if _hw_id_for_ctx and _simple_base in _HW_DETAIL_KEYS:
                _HW_DB_LOOKUP = {
                    'cat_hw_server':  (_svc_get_hw_server,  'server_code',  'form_factor',  'usage_count'),
                    'cat_hw_storage': (_svc_get_hw_storage, 'storage_code', 'storage_type', 'storage_count'),
                    'cat_hw_san':     (_svc_get_hw_san,     'san_code',     'san_type',     'san_count'),
                    'cat_hw_network': (_svc_get_hw_network, 'network_code', 'network_type', 'device_count'),
                    'cat_hw_security':(_svc_get_hw_security,'security_code','security_type','device_count'),
                }
                _lu = _HW_DB_LOOKUP.get(_simple_base)
                if _lu:
                    try:
                        _fn, _code_key, _type_key, _count_key = _lu
                        _dbrow = _fn(int(_hw_id_for_ctx))
                        if _dbrow:
                            _vendor_code = str(_dbrow.get('manufacturer_code') or '').strip()
                            _vendor_name = str(_dbrow.get('manufacturer_name') or '').strip()
                            if not _vendor_name and _vendor_code:
                                try:
                                    _vendor_row = get_vendor_by_code(_vendor_code, include_deleted=True)
                                except Exception:
                                    _vendor_row = None
                                _vendor_name = str((_vendor_row or {}).get('manufacturer_name') or (_vendor_row or {}).get('vendor') or '').strip()
                            _server_code_for_ctx = str(_dbrow.get(_code_key) or '').strip()
                            _hw_extra_for_ctx['hw_type'] = str(_dbrow.get(_type_key) or '').strip()
                            _hw_extra_for_ctx['release_date'] = str(_dbrow.get('release_date') or '').strip()
                            _hw_extra_for_ctx['eosl'] = str(_dbrow.get('eosl_date') or '').strip()
                            _qty = _dbrow.get(_count_key)
                            if _qty is None:
                                _qty = _dbrow.get('usage_count')
                            _hw_extra_for_ctx['qty'] = str(_qty) if _qty is not None else ''
                            _hw_extra_for_ctx['note'] = str(_dbrow.get('remark') or '').strip()
                            title = str(_dbrow.get('model_name') or '').strip() or '모델명'
                            subtitle = _vendor_name or _vendor_code or '제조사'
                            # Persist refreshed data back to session
                            _cb_key = _cat_base_key(key)
                            _ctx_store = session.get('cat_detail_ctx_v1')
                            if isinstance(_ctx_store, dict):
                                _existing = _ctx_store.get(_cb_key)
                                if isinstance(_existing, dict):
                                    _existing['server_code'] = _server_code_for_ctx
                                    _existing['title'] = title
                                    _existing['subtitle'] = subtitle
                                    for _ek, _evv in _hw_extra_for_ctx.items():
                                        _existing[_ek] = _evv
                                    session.modified = True
                    except Exception:
                        pass

    # Category > Business > Work Group detail pages
    # Title: group name, Subtitle: group_code
    _WG_DETAIL_KEYS = {
        'cat_business_group_detail', 'cat_business_group_manager',
        'cat_business_group_system', 'cat_business_group_service',
        'cat_business_group_task', 'cat_business_group_log',
        'cat_business_group_file',
    }
    if key in _WG_DETAIL_KEYS:
        _wg_id = _cat_sess.get('id', '')
        _wg_resolved = False
        if _wg_id:
            try:
                _wg_row = _svc_get_work_group(int(_wg_id))
                if _wg_row:
                    title = str(_wg_row.get('group_name') or '').strip() or '업무 그룹'
                    subtitle = str(_wg_row.get('group_code') or '').strip() or 'Work Group'
                    _wg_resolved = True
                    # 세션 컨텍스트도 최신 값으로 갱신
                    _ctx_store = session.get('cat_detail_ctx_v1')
                    if isinstance(_ctx_store, dict):
                        _existing = _ctx_store.get('cat_business_group')
                        if isinstance(_existing, dict):
                            _existing['title'] = title
                            _existing['subtitle'] = subtitle
                            session.modified = True
            except Exception:
                pass
        if not _wg_resolved:
            title = _cat_sess.get('title', '') or '업무 그룹'
            subtitle = _cat_sess.get('subtitle', '') or 'Work Group'

    # Category > Customer detail pages (Member / Client1 / Client2)
    # Title: customer_name, Subtitle: address
    _CUSTOMER_DETAIL_LOOKUP = {
        'cat_customer_client1': (_svc_get_customer_associate, '고객'),
    }
    if _is_cat_tab_key(key) and key not in VENDOR_DETAIL_KEYS:
        _cust_base = _cat_base_key(key)
        _cust_lu = _CUSTOMER_DETAIL_LOOKUP.get(_cust_base)
        if _cust_lu:
            _cust_fn, _cust_label = _cust_lu
            _cust_id = _cat_sess.get('id', '')
            _cust_resolved = False
            if _cust_id:
                try:
                    _cust_row = _cust_fn(int(_cust_id))
                    if _cust_row:
                        title = str(_cust_row.get('customer_name') or '').strip() or _cust_label
                        subtitle = str(_cust_row.get('address') or '').strip() or '-'
                        _cust_resolved = True
                        _ctx_store = session.get('cat_detail_ctx_v1')
                        if isinstance(_ctx_store, dict):
                            _existing = _ctx_store.get(_cust_base)
                            if isinstance(_existing, dict):
                                _existing['title'] = title
                                _existing['subtitle'] = subtitle
                                session.modified = True
                except Exception:
                    pass
            if not _cust_resolved:
                title = _cat_sess.get('title', '') or _cust_label
                subtitle = _cat_sess.get('subtitle', '') or '-'

    # Category > Software > OS detail pages
    # Title: model name, Subtitle: vendor name
    if key in {
        'cat_sw_os_detail',
        'cat_sw_os_system',
        'cat_sw_os_task',
        'cat_sw_os_log',
        'cat_sw_os_file',
    }:
        raw_os_id = (request.args.get('os_id') or '').strip()
        if not raw_os_id:
            raw_os_id = _cat_sess.get('id', '')
        resolved = None
        if raw_os_id:
            try:
                resolved = get_sw_os_type(int(raw_os_id))
            except Exception:
                resolved = None
        if resolved:
            vendor_code = (resolved.get('manufacturer_code') or '').strip()
            vendor_row = None
            if vendor_code:
                try:
                    vendor_row = get_vendor_by_code(vendor_code, include_deleted=True)
                except Exception:
                    vendor_row = None
            vendor_name = ((vendor_row or {}).get('manufacturer_name') or (vendor_row or {}).get('vendor') or vendor_code).strip()
            os_detail = {
                'os_id': resolved.get('id'),
                'model': resolved.get('model_name') or '',
                'vendor': vendor_name or '',
                'vendor_code': vendor_code or '',
                'hw_type': resolved.get('os_type') or '',
                'release_date': resolved.get('release_date') or '',
                'eosl': resolved.get('eosl_date') or '',
                'qty': resolved.get('license_count') or 0,
                'note': resolved.get('remark') or '',
            }
            title = (os_detail.get('model') or '').strip() or '모델명'
            subtitle = (os_detail.get('vendor') or '').strip() or '제조사'
        else:
            title = _cat_sess.get('title', '') or '모델명'
            subtitle = _cat_sess.get('subtitle', '') or '제조사'

    # Governance > Dedicated Line Policy detail pages
    # Title: org name, Subtitle: protocol
    if key in {
        'gov_dedicatedline_member_detail',
        'gov_dedicatedline_member_manager',
        'gov_dedicatedline_member_task',
        'gov_dedicatedline_member_log',
        'gov_dedicatedline_member_file',
        'gov_dedicatedline_customer_detail',
        'gov_dedicatedline_customer_manager',
        'gov_dedicatedline_customer_task',
        'gov_dedicatedline_customer_log',
        'gov_dedicatedline_customer_file',
        'gov_dedicatedline_van_detail',
        'gov_dedicatedline_van_manager',
        'gov_dedicatedline_van_task',
        'gov_dedicatedline_van_log',
        'gov_dedicatedline_van_file',
        'gov_dedicatedline_affiliate_detail',
        'gov_dedicatedline_affiliate_manager',
        'gov_dedicatedline_affiliate_task',
        'gov_dedicatedline_affiliate_log',
        'gov_dedicatedline_affiliate_file',
        'gov_dedicatedline_intranet_detail',
        'gov_dedicatedline_intranet_manager',
        'gov_dedicatedline_intranet_task',
        'gov_dedicatedline_intranet_log',
        'gov_dedicatedline_intranet_file',
    }:
        # 1) Session context (SPA tab navigation)
        org_name = (_gov_sess.get('title') or '').strip()
        protocol = (_gov_sess.get('subtitle') or '').strip()
        # 2) Query params (legacy / first visit)
        org_name = org_name or (request.args.get('org_name') or '').strip()
        protocol = protocol or (request.args.get('protocol_code') or request.args.get('protocol') or '').strip()
        # 3) If still missing, try DB lookup via session ID
        if (not org_name or not protocol) and _gov_sess.get('id'):
            try:
                _dl_row = NetLeasedLine.query.filter(
                    NetLeasedLine.id == int(_gov_sess['id'])
                ).first()
                if _dl_row:
                    org_name = org_name or getattr(_dl_row, 'org_name', '') or ''
                    protocol = protocol or getattr(_dl_row, 'protocol_code', '') or ''
            except Exception:
                pass
        title = org_name or '기관명'
        subtitle = protocol or '프로토콜'

    # Category > Software > Middleware detail pages
    # Title: model name, Subtitle: vendor name
    if key in {
        'cat_sw_middleware_detail',
        'cat_sw_middleware_system',
        'cat_sw_middleware_task',
        'cat_sw_middleware_log',
        'cat_sw_middleware_file',
    }:
        raw_id = (request.args.get('middleware_id') or '').strip()
        if not raw_id:
            raw_id = _cat_sess.get('id', '')
        resolved = None
        if raw_id:
            try:
                resolved = get_sw_middleware_type(int(raw_id))
            except Exception:
                resolved = None
        if resolved:
            vendor_code = (resolved.get('manufacturer_code') or '').strip()
            vendor_name = (resolved.get('manufacturer_name') or '').strip()
            if not vendor_name and vendor_code:
                try:
                    vendor_row = get_vendor_by_code(vendor_code, include_deleted=True)
                except Exception:
                    vendor_row = None
                vendor_name = ((vendor_row or {}).get('manufacturer_name') or (vendor_row or {}).get('vendor') or vendor_code).strip()
            middleware_detail = {
                'middleware_id': resolved.get('id'),
                'model': resolved.get('model_name') or '',
                'vendor': vendor_name or '',
                'vendor_code': vendor_code or '',
                'hw_type': resolved.get('middleware_type') or '',
                'release_date': resolved.get('release_date') or '',
                'eosl': resolved.get('eosl_date') or '',
                'qty': resolved.get('middleware_count') or 0,
                'note': resolved.get('remark') or '',
            }
            title = (middleware_detail.get('model') or '').strip() or '모델명'
            subtitle = (middleware_detail.get('vendor') or '').strip() or '제조사'
        else:
            title = _cat_sess.get('title', '') or '모델명'
            subtitle = _cat_sess.get('subtitle', '') or '제조사'

    # Category > Software > Virtualization detail pages
    # Title: model name, Subtitle: vendor name
    if key in {
        'cat_sw_virtualization_detail',
        'cat_sw_virtualization_system',
        'cat_sw_virtualization_task',
        'cat_sw_virtualization_log',
        'cat_sw_virtualization_file',
    }:
        raw_id = (request.args.get('virtual_id') or '').strip()
        if not raw_id:
            raw_id = _cat_sess.get('id', '')
        resolved = None
        if raw_id:
            try:
                resolved = get_sw_virtual_type(int(raw_id))
            except Exception:
                resolved = None
        if resolved:
            vendor_code = (resolved.get('manufacturer_code') or '').strip()
            vendor_name = (resolved.get('manufacturer_name') or '').strip()
            if not vendor_name and vendor_code:
                try:
                    vendor_row = get_vendor_by_code(vendor_code, include_deleted=True)
                except Exception:
                    vendor_row = None
                vendor_name = ((vendor_row or {}).get('manufacturer_name') or (vendor_row or {}).get('vendor') or vendor_code).strip()
            virtualization_detail = {
                'virtual_id': resolved.get('id'),
                'model': resolved.get('virtual_name') or '',
                'vendor': vendor_name or '',
                'vendor_code': vendor_code or '',
                'hw_type': resolved.get('virtual_family') or '',
                'release_date': resolved.get('release_date') or '',
                'eosl': resolved.get('eosl_date') or '',
                'qty': resolved.get('virtual_count') or 0,
                'note': resolved.get('remark') or '',
            }
            title = (virtualization_detail.get('model') or '').strip() or '모델명'
            subtitle = (virtualization_detail.get('vendor') or '').strip() or '제조사'
        else:
            title = _cat_sess.get('title', '') or '모델명'
            subtitle = _cat_sess.get('subtitle', '') or '제조사'

    # Category > Software > Security detail pages
    # Title: model name, Subtitle: vendor name
    if key in {
        'cat_sw_security_detail',
        'cat_sw_security_system',
        'cat_sw_security_task',
        'cat_sw_security_log',
        'cat_sw_security_file',
    }:
        raw_id = (request.args.get('security_id') or '').strip()
        if not raw_id:
            raw_id = _cat_sess.get('id', '')
        resolved = None
        if raw_id:
            try:
                resolved = get_sw_security_type(int(raw_id))
            except Exception:
                resolved = None
        if resolved:
            vendor_code = (resolved.get('manufacturer_code') or '').strip()
            vendor_name = (resolved.get('manufacturer_name') or '').strip()
            if not vendor_name and vendor_code:
                try:
                    vendor_row = get_vendor_by_code(vendor_code, include_deleted=True)
                except Exception:
                    vendor_row = None
                vendor_name = ((vendor_row or {}).get('manufacturer_name') or (vendor_row or {}).get('vendor') or vendor_code).strip()
            security_detail = {
                'security_id': resolved.get('id'),
                'model': resolved.get('secsw_name') or '',
                'vendor': vendor_name or '',
                'vendor_code': vendor_code or '',
                'hw_type': resolved.get('secsw_family') or '',
                'release_date': resolved.get('release_date') or '',
                'eosl': resolved.get('eosl_date') or '',
                'qty': resolved.get('secsw_count') or 0,
                'note': resolved.get('remark') or '',
            }
            title = (security_detail.get('model') or '').strip() or '모델명'
            subtitle = (security_detail.get('vendor') or '').strip() or '제조사'
        else:
            title = _cat_sess.get('title', '') or '모델명'
            subtitle = _cat_sess.get('subtitle', '') or '제조사'

    # Category > Software > High Availability detail pages
    # Title: model name, Subtitle: vendor name
    if key in {
        'cat_sw_high_availability_detail',
        'cat_sw_high_availability_system',
        'cat_sw_high_availability_task',
        'cat_sw_high_availability_log',
        'cat_sw_high_availability_file',
    }:
        raw_id = (request.args.get('ha_id') or '').strip()
        if not raw_id:
            raw_id = _cat_sess.get('id', '')
        resolved = None
        if raw_id:
            try:
                resolved = get_sw_ha_type(int(raw_id))
            except Exception:
                resolved = None
        if resolved:
            vendor_code = (resolved.get('manufacturer_code') or '').strip()
            vendor_name = (resolved.get('manufacturer_name') or '').strip()
            if not vendor_name and vendor_code:
                try:
                    vendor_row = get_vendor_by_code(vendor_code, include_deleted=True)
                except Exception:
                    vendor_row = None
                vendor_name = ((vendor_row or {}).get('manufacturer_name') or (vendor_row or {}).get('vendor') or vendor_code).strip()
            ha_detail = {
                'ha_id': resolved.get('id'),
                'model': resolved.get('ha_name') or '',
                'vendor': vendor_name or '',
                'vendor_code': vendor_code or '',
                'hw_type': resolved.get('ha_mode') or '',
                'release_date': resolved.get('release_date') or '',
                'eosl': resolved.get('eosl_date') or '',
                'qty': resolved.get('ha_count') or 0,
                'note': resolved.get('remark') or '',
            }
            title = (ha_detail.get('model') or '').strip() or '모델명'
            subtitle = (ha_detail.get('vendor') or '').strip() or '제조사'
        else:
            title = _cat_sess.get('title', '') or '모델명'
            subtitle = _cat_sess.get('subtitle', '') or '제조사'

    # Category > Software > Database detail pages
    # Title: model name, Subtitle: vendor name
    if key in {
        'cat_sw_database_detail',
        'cat_sw_database_system',
        'cat_sw_database_task',
        'cat_sw_database_log',
        'cat_sw_database_file',
    }:
        raw_db_id = (request.args.get('db_id') or '').strip()
        if not raw_db_id:
            raw_db_id = _cat_sess.get('id', '')
        resolved = None
        if raw_db_id:
            try:
                resolved = get_sw_db_type(int(raw_db_id))
            except Exception:
                resolved = None
        if resolved:
            vendor_code = (resolved.get('manufacturer_code') or '').strip()
            vendor_row = None
            if vendor_code:
                try:
                    vendor_row = get_vendor_by_code(vendor_code)
                except Exception:
                    vendor_row = None
            vendor_name = ((vendor_row or {}).get('manufacturer_name') or (vendor_row or {}).get('vendor') or vendor_code).strip()
            db_detail = {
                'db_id': resolved.get('id'),
                'model': resolved.get('db_name') or '',
                'vendor': vendor_name or '',
                'vendor_code': vendor_code or '',
                'hw_type': resolved.get('db_family') or '',
                'release_date': resolved.get('release_date') or '',
                'eosl': resolved.get('eosl_date') or '',
                'qty': resolved.get('db_count') or 0,
                'note': resolved.get('remark') or '',
            }
            title = (db_detail.get('model') or '').strip() or '모델명'
            subtitle = (db_detail.get('vendor') or '').strip() or '제조사'
        else:
            title = _cat_sess.get('title', '') or '모델명'
            subtitle = _cat_sess.get('subtitle', '') or '제조사'

    # -----------------------------------------------------------------------
    # Category > Vendor > Manufacturer / Maintenance detail pages
    # Canonical URL is /p/<key> only (no id in query string).
    # The selected vendor_id is stored in session['vendor_detail_ctx_v1'].
    # Legacy ?vendor_id= / ?id= query params are accepted for backward compat
    # and immediately redirected to the clean URL after storing context.
    # -----------------------------------------------------------------------

    if key in VENDOR_DETAIL_KEYS:
        def _vendor_base_key(k: str) -> str:
            base = k
            for suf in ('_detail', '_system', '_manager', '_hardware', '_software',
                        '_component', '_sla', '_issue', '_task', '_log', '_file'):
                if base.endswith(suf):
                    base = base[: -len(suf)]
                    break
            return base

        _vd_base = _vendor_base_key(key)
        _vd_is_manufacturer = _vd_base.endswith('_manufacturer')

        def _set_vendor_ctx(vid: int) -> None:
            ctx = session.get('vendor_detail_ctx_v1')
            if not isinstance(ctx, dict):
                ctx = {}
            ctx[_vd_base] = vid
            session['vendor_detail_ctx_v1'] = ctx
            session.modified = True

        # Legacy query params → store in session and redirect to clean URL
        _vd_qp_id = request.args.get('vendor_id') or request.args.get('id') or ''
        try:
            _vd_qp_id = int(_vd_qp_id)
        except (TypeError, ValueError):
            _vd_qp_id = None

        if _vd_qp_id:
            _set_vendor_ctx(_vd_qp_id)
            return redirect(url_for('pages.show', key=key), code=302)

        # Canonical: read vendor_id from session
        _vd_vid = None
        try:
            _vd_ctx = session.get('vendor_detail_ctx_v1')
            if isinstance(_vd_ctx, dict):
                _vd_vid = _vd_ctx.get(_vd_base)
                if _vd_vid is not None:
                    _vd_vid = int(_vd_vid)
        except (TypeError, ValueError):
            _vd_vid = None

        if not _vd_vid:
            # No context — redirect back to list
            _list_key = _vd_base  # e.g. 'cat_vendor_manufacturer' or 'cat_vendor_maintenance'
            return redirect(url_for('pages.show', key=_list_key), code=302)

        # DB lookup for title / subtitle
        _vd_vendor_name = ''
        _vd_business_no = ''
        try:
            if _vd_is_manufacturer:
                _vd_row = svc_get_manufacturer_vendor(_vd_vid)
            else:
                _vd_row = svc_get_maintenance_vendor(_vd_vid)
            if _vd_row:
                _vd_vendor_name = _vd_row.get('vendor') or _vd_row.get('manufacturer_name') or _vd_row.get('maintenance_name') or ''
                _vd_business_no = _vd_row.get('business_number') or _vd_row.get('business_no') or ''
        except Exception:
            pass

        if _vd_is_manufacturer:
            title = _vd_vendor_name or '제조사'
        else:
            title = _vd_vendor_name or '유지보수사'
        subtitle = _vd_business_no or '-'
    rack_code = (request.args.get('rack_code') or '').strip() or None
    if rack_code and key.startswith('dc_rack_detail_'):
        session['_rack_code'] = rack_code
        return redirect(url_for('pages.show', key=key))
    if not rack_code and key.startswith('dc_rack_detail_'):
        rack_code = session.get('_rack_code')

    # Expose the category-session ID for any cat_ detail/tab page.
    _cat_detail_id = _cat_sess.get('id', '') if _cat_sess else ''

    # Expose the governance-session ID for any gov_ detail/tab page.
    _gov_detail_id = _gov_sess.get('id', '') if _gov_sess else ''

    context = {
        'db_detail': db_detail,
        'os_detail': os_detail,
        'middleware_detail': middleware_detail,
        'virtualization_detail': virtualization_detail,
        'security_detail': security_detail,
        'ha_detail': ha_detail,
        'hw_id': _hw_id_for_ctx,
        'server_code': _server_code_for_ctx,
        'cat_detail_id': _cat_detail_id,
        'gov_detail_id': _gov_detail_id,
        **_hw_extra_for_ctx,
    }
    # tab14-log 페이지용 storage_prefix (sessionStorage 키 조회에 사용)
    try:
        context['storage_prefix'] = _tab14_storage_prefix
    except NameError:
        context['storage_prefix'] = ''

    # ── tab32 할당정보(스토리지) 컨텍스트 주입 ────────────────────────────
    try:
        if _is_tab32_assign:
            context['storage_prefix'] = _tab32_storage_prefix
    except NameError:
        pass
    # ── tab31 구성정보(스토리지) 컨텍스트 주입 ────────────────────────────
    try:
        context['tab31_scope_key']    = _tab31_scope_key
        context['tab31_api_base']     = _tab31_api_base
        context['tab31_asset_prefix'] = _tab31_asset_prefix
        context['tab31_list_path']    = _tab31_list_path
    except NameError:
        pass

    # 거버넌스 IP 정책: 중앙 변경이력 entity 컨텍스트 전달
    if key == 'gov_ip_policy_log' and _gov_detail_id:
        context['tab14_entity_type'] = 'network_ip_policy'
        context['tab14_entity_id'] = _gov_detail_id
    # 거버넌스 DNS 정책: 중앙 변경이력 entity 컨텍스트 전달
    if key == 'gov_dns_policy_log' and _gov_detail_id:
        context['tab14_entity_type'] = 'network_dns_policy'
        context['tab14_entity_id'] = _gov_detail_id
    # 거버넌스 AD 정책: 중앙 변경이력 entity 컨텍스트 전달
    if key == 'gov_ad_policy_log' and _gov_detail_id:
        context['tab14_entity_type'] = 'network_ad_policy'
        context['tab14_entity_id'] = _gov_detail_id
    # 거버넌스 VPN 정책: 중앙 변경이력 entity 컨텍스트 전달
    _VPN_LOG_KEYS = {
        'gov_vpn_policy_log', 'gov_vpn_policy2_log', 'gov_vpn_policy3_log',
        'gov_vpn_policy4_log', 'gov_vpn_policy5_log',
    }
    if key in _VPN_LOG_KEYS and _gov_detail_id:
        context['tab14_entity_type'] = 'network_vpn_line'
        context['tab14_entity_id'] = _gov_detail_id
    # 거버넌스 전용회선 정책: 중앙 변경이력 entity 컨텍스트 전달
    _DEDICATED_LOG_KEYS = {
        'gov_dedicatedline_member_log', 'gov_dedicatedline_customer_log',
        'gov_dedicatedline_van_log', 'gov_dedicatedline_affiliate_log',
        'gov_dedicatedline_intranet_log',
    }
    if key in _DEDICATED_LOG_KEYS and _gov_detail_id:
        context['tab14_entity_type'] = 'network_leased_line'
        context['tab14_entity_id'] = _gov_detail_id
    # 데이터센터 RACK: 중앙 변경이력 entity 컨텍스트 전달
    if key == 'dc_rack_detail_log' and rack_code:
        try:
            from app.services.org_rack_service import fetch_by_rack_code as _svc_rack_by_code
            _rack_rec = _svc_rack_by_code(rack_code)
            if _rack_rec and _rack_rec.get('id'):
                context['tab14_entity_type'] = 'org_rack'
                context['tab14_entity_id'] = str(_rack_rec['id'])
        except Exception:
            pass
    # 카테고리>하드웨어: 중앙 변경이력 entity 컨텍스트 전달
    _CAT_HW_LOG_ENTITY_MAP = {
        'cat_hw_server_log': 'hw_server_type',
        'cat_hw_storage_log': 'hw_storage_type',
        'cat_hw_san_log': 'hw_san_type',
        'cat_hw_network_log': 'hw_network_type',
        'cat_hw_security_log': 'hw_security_type',
    }
    if key in _CAT_HW_LOG_ENTITY_MAP and _cat_detail_id:
        context['tab14_entity_type'] = _CAT_HW_LOG_ENTITY_MAP[key]
        context['tab14_entity_id'] = str(_cat_detail_id)
    # 카테고리>소프트웨어: 중앙 변경이력 entity 컨텍스트 전달
    _CAT_SW_LOG_ENTITY_MAP = {
        'cat_sw_os_log': 'sw_os_type',
        'cat_sw_database_log': 'sw_db_type',
        'cat_sw_middleware_log': 'sw_middleware_type',
        'cat_sw_virtualization_log': 'sw_virtual_type',
        'cat_sw_security_log': 'sw_security_type',
        'cat_sw_high_availability_log': 'sw_ha_type',
    }
    if key in _CAT_SW_LOG_ENTITY_MAP and _cat_detail_id:
        context['tab14_entity_type'] = _CAT_SW_LOG_ENTITY_MAP[key]
        context['tab14_entity_id'] = str(_cat_detail_id)
    # 카테고리>컴포넌트: 변경이력 entity 컨텍스트 전달
    _CAT_COMPONENT_LOG_ENTITY_MAP = {
        'cat_component_cpu_log': 'cmp_cpu_type',
        'cat_component_gpu_log': 'cmp_gpu_type',
        'cat_component_memory_log': 'cmp_memory_type',
        'cat_component_disk_log': 'cmp_disk_type',
        'cat_component_nic_log': 'cmp_nic_type',
        'cat_component_hba_log': 'cmp_hba_type',
        'cat_component_etc_log': 'cmp_etc_type',
    }
    if key in _CAT_COMPONENT_LOG_ENTITY_MAP and _cat_detail_id:
        context['tab14_entity_type'] = _CAT_COMPONENT_LOG_ENTITY_MAP[key]
        context['tab14_entity_id'] = str(_cat_detail_id)
    # 카테고리>비즈니스>업무그룹: 변경이력 entity 컨텍스트 전달
    if key == 'cat_business_group_log' and _cat_detail_id:
        context['tab14_entity_type'] = 'biz_work_group'
        context['tab14_entity_id'] = str(_cat_detail_id)
    # 카테고리>벤더: 변경이력 entity 컨텍스트 전달
    _VENDOR_LOG_ENTITY_MAP = {
        'cat_vendor_manufacturer_log': 'vendor_manufacturer',
        'cat_vendor_maintenance_log': 'vendor_maintenance',
    }
    if key in _VENDOR_LOG_ENTITY_MAP:
        try:
            if _vd_vid:
                context['tab14_entity_type'] = _VENDOR_LOG_ENTITY_MAP[key]
                context['tab14_entity_id'] = str(_vd_vid)
        except NameError:
            pass
    # 카테고리 상세(구성/파일 탭): owner_key 를 JS 에 전달하여 파일 업로드 가능하게 함
    if key.endswith('_file') and _cat_detail_id:
        context['tab15_owner_key'] = str(_cat_detail_id)
    if key.endswith('_file') and not context.get('tab15_owner_key') and hw_asset_id:
        context['tab15_owner_key'] = str(hw_asset_id)
    # 거버넌스 상세(구성/파일 탭): gov_detail_id 를 owner_key 로 전달
    if key.endswith('_file') and not context.get('tab15_owner_key') and _gov_detail_id:
        context['tab15_owner_key'] = str(_gov_detail_id)
    # 소프트웨어·비용 등(구성/파일 탭): detail_manage_no 또는 detail_entity_key 를 owner_key 로 전달
    if key.endswith('_file') and not context.get('tab15_owner_key') and detail_entity_key:
        context['tab15_owner_key'] = str(detail_entity_key)
    if key.endswith('_file') and not context.get('tab15_owner_key') and detail_manage_no:
        context['tab15_owner_key'] = str(detail_manage_no)
    # ── tab08 방화벽 컨텍스트 주입 ────────────────────────────────────────
    try:
        if _tab08_storage_prefix is not None:
            context['storage_prefix'] = _tab08_storage_prefix
    except NameError:
        pass
    try:
        if _is_fw_tab:
            context.setdefault('tab08_api_base', '/api/hw-firewallds')
    except NameError:
        pass
    # ── tab21 전면베이 컨텍스트 주입 ──────────────────────────────────────
    try:
        if _is_frontbay_tab:
            if _tab21_storage_prefix:
                context['storage_prefix'] = _tab21_storage_prefix
            context.setdefault('tab21_api_base', '/api/hw-frame-frontbay')
            context.setdefault('tab21_type_options', '서버,SAN')
            context.setdefault('tab21_bay_count', '16')
    except NameError:
        pass
    # ── tab22 후면베이 컨텍스트 주입 ──────────────────────────────────────
    try:
        if _is_rearbay_tab:
            if _tab22_storage_prefix:
                context['storage_prefix'] = _tab22_storage_prefix
            context.setdefault('tab22_api_base', '/api/hw-frame-rearbay')
            context.setdefault('tab22_type_options', 'SAN,네트워크')
            context.setdefault('tab22_bay_count', '8')
    except NameError:
        pass
    # ── tab11 작업이력 컨텍스트 주입 ──────────────────────────────────────
    try:
        if _tab11_mode:
            context['tab11_mode'] = _tab11_mode
            context['tab11_storage_prefix'] = _tab11_storage_prefix
            context['tab11_scope_type'] = _tab11_scope_type
            # scope_id: 하드웨어=hw_asset_id, 카테고리=cat_detail_id, 거버넌스=gov_detail_id, SW=detail_entity_key
            if _tab11_mode == 'local':
                _tab11_sid = ''
                if _cat_detail_id:
                    _tab11_sid = str(_cat_detail_id)
                elif _gov_detail_id:
                    _tab11_sid = str(_gov_detail_id)
                elif hw_asset_id:
                    _tab11_sid = str(hw_asset_id)
                elif detail_entity_key:
                    _tab11_sid = str(detail_entity_key)
                elif detail_manage_no:
                    _tab11_sid = str(detail_manage_no)
                context['tab11_scope_id'] = _tab11_sid
                context['tab11_scope_ref'] = _tab11_scope_ref
    except NameError:
        pass
    # ── tab12 취약점 컨텍스트 주입 ────────────────────────────────────────
    try:
        if _tab12_asset_category:
            context['tab12_asset_category'] = _tab12_asset_category
    except NameError:
        pass
    # ── tab13 패키지 컨텍스트 주입 ────────────────────────────────────────
    try:
        if _tab13_scope:
            context['tab13_scope'] = _tab13_scope
    except NameError:
        pass
    # ── tab91 시스템/자산 공유탭 컨텍스트 주입 ────────────────────────────
    try:
        if _is_tab91:
            # entity_id는 routing block 시점에 알 수 없으므로 context 단계에서 주입
            _tab91_context['tab91_entity_id'] = str(_cat_detail_id) if _cat_detail_id else ''
            context.update(_tab91_context)
    except NameError:
        pass
    # ── tab95 컴포넌트 공유탭 컨텍스트 주입 ─────────────────────────────
    try:
        if _is_tab95:
            context.update(_tab95_context)
    except NameError:
        pass
    # 하드웨어 상세: 변경이력 entity 컨텍스트 전달
    if _hwb and key == _hwb + '_log' and hw_asset_id:
        context['tab14_entity_type'] = 'hardware_asset'
        context['tab14_entity_id'] = str(hw_asset_id)
    # Hardware pages: ensure work reference lists are always available for server-rendered modals.
    # Intentionally scoped to templates under `2.hardware/` only.
    if template.startswith('2.hardware/'):
        def _safe_list(fn, label_key: str):
            try:
                items = fn() or []
            except Exception:
                items = []
            try:
                return sorted(
                    items,
                    key=lambda x: (str((x or {}).get(label_key) or '').strip(), str((x or {}).get('id') or '')),
                )
            except Exception:
                return items

        work_categories = _safe_list(list_work_categories, 'wc_name')
        work_divisions = _safe_list(list_work_divisions, 'wc_name')
        work_statuses = _safe_list(list_work_statuses, 'wc_name')
        work_operations = _safe_list(list_work_operations, 'wc_name')
        work_groups = _safe_list(list_work_groups, 'group_name')

        fk_preload = {
            'WORK_CATEGORY': work_categories,
            'WORK_DIVISION': work_divisions,
            'WORK_STATUS': work_statuses,
            'WORK_OPERATION': work_operations,
            'WORK_GROUP': work_groups,
        }

        context.update(
            work_categories=work_categories,
            work_divisions=work_divisions,
            work_statuses=work_statuses,
            work_operations=work_operations,
            work_groups=work_groups,
            fk_preload=fk_preload,
        )

    # 거버넌스 VPN 정책: vpn_base 컨텍스트 전달 (템플릿 공유용)
    if key.startswith('gov_vpn_policy'):
        import re as _re_vpn_base
        _m_vpn = _re_vpn_base.match(r'^(gov_vpn_policy\d?)', key)
        context['vpn_base'] = _m_vpn.group(1) if _m_vpn else 'gov_vpn_policy'

    # 거버넌스 전용회선 정책: dl_base / dl_label / dl_group 컨텍스트 전달 (템플릿 공유용)
    if key.startswith('gov_dedicatedline_'):
        import re as _re_dl_base
        _m_dl = _re_dl_base.match(r'^(gov_dedicatedline_(?:member|customer|van|affiliate|intranet))', key)
        _dl_base_key = _m_dl.group(1) if _m_dl else 'gov_dedicatedline_member'
        context['dl_base'] = _dl_base_key
        _dl_label_map = {
            'gov_dedicatedline_member': '회원사',
            'gov_dedicatedline_customer': '고객사',
            'gov_dedicatedline_van': 'VAN사',
            'gov_dedicatedline_affiliate': '제휴사',
            'gov_dedicatedline_intranet': '사내망',
        }
        _dl_group_map = {
            'gov_dedicatedline_member': 'MEMBER',
            'gov_dedicatedline_customer': 'CUSTOMER',
            'gov_dedicatedline_van': 'VAN',
            'gov_dedicatedline_affiliate': 'PARTNER',
            'gov_dedicatedline_intranet': 'INHOUSE',
        }
        context['dl_label'] = _dl_label_map.get(_dl_base_key, '회원사')
        context['dl_group'] = _dl_group_map.get(_dl_base_key, 'MEMBER')

    if key.startswith('hw_security_vpn_'):
        selected_asset_id = None
        for qk in ('asset_id', 'assetId', 'id'):
            qv = request.args.get(qk)
            if not qv:
                continue
            try:
                selected_asset_id = int(str(qv).strip())
                break
            except Exception:
                continue
        if selected_asset_id is None:
            try:
                selected_asset_id = session.pop('hw_security_vpn:selected:asset_id', None)
            except Exception:
                selected_asset_id = None
        context['vpn_selected_asset_id'] = selected_asset_id
        if selected_asset_id:
            try:
                context['vpn_asset_prefill'] = svc_get_hardware_asset(
                    selected_asset_id,
                    asset_category='SECURITY',
                    asset_type='VPN',
                )
            except Exception:
                context['vpn_asset_prefill'] = None

    # -----------------------------------------------------------------------
    # RACK system_lab 범용 템플릿: 탭별 설정 주입
    # -----------------------------------------------------------------------
    _RACK_LAB_DEFAULTS = {
        'dc_rack_lab1': {
            'page_class': 'page-rack-lab1',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'layout_style': '',
            'overlay_store_key': 'rack_lab1_overlay_boxes',
            'surface_api_base': '/api/system-lab1-surfaces',
            'center_code': '샘플 데이터센터',
        },
        'dc_rack_lab2': {
            'page_class': 'page-system-lab2',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'layout_style': '',
            'overlay_store_key': 'rack_lab2_overlay_boxes',
            'surface_api_base': '/api/system-lab2-surfaces',
            'center_code': '샘플 데이터센터',
        },
        'dc_rack_lab3': {
            'page_class': 'page-system-lab3',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'layout_style': 'width:75%; margin:0 auto;',
            'overlay_store_key': 'rack_lab3_overlay_boxes',
            'surface_api_base': '',
            'center_code': '샘플 데이터센터',
        },
        'dc_rack_lab4': {
            'page_class': 'page-system-lab4',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'layout_style': 'width:75%; margin:0 auto;',
            'overlay_store_key': 'rack_lab4_overlay_boxes',
            'surface_api_base': '',
            'center_code': '샘플 데이터센터',
        },
    }
    if key in _RACK_LAB_DEFAULTS or (key.startswith('dc_rack_lab') and key not in ('dc_rack_list',)):
        import json as _json_rack
        _rack_cfg = {}
        _tab = None
        try:
            _tab = PageTabConfig.query.filter(
                PageTabConfig.route_key == key,
                PageTabConfig.is_active == 1,
                PageTabConfig.is_deleted == 0,
            ).first()
            if _tab and _tab.extra_options:
                _rack_cfg = _json_rack.loads(_tab.extra_options) or {}
        except Exception:
            pass
        if not _rack_cfg:
            _rack_cfg = _RACK_LAB_DEFAULTS.get(key, {})
        context['page_class'] = _rack_cfg.get('page_class', 'page-rack-lab')
        # 탭 제목을 center_name 으로 사용
        context['center_name'] = (_tab.tab_name if _tab and _tab.tab_name else _rack_cfg.get('center_name', '배치도'))
        context['bg_image'] = _rack_cfg.get('bg_image', '')
        context['layout_style'] = _rack_cfg.get('layout_style', '')
        context['overlay_store_key'] = _rack_cfg.get('overlay_store_key', '')
        context['surface_api_base'] = _rack_cfg.get('surface_api_base', '')
        context['center_code'] = _rack_cfg.get('center_code', '')

    # -----------------------------------------------------------------------
    # CCTV system_lab 범용 템플릿: 탭별 설정 주입
    # TEMPLATE_MAP의 dc_cctv_lab* 키가 모두 동일한 범용 템플릿을 가리키므로,
    # 각 탭에 맞는 center_name, bg_image, api_base 등을 context로 전달한다.
    # PageTabConfig.extra_options에 설정이 있으면 우선 사용하고,
    # 없으면 기존 하드코딩 기본값(fallback)을 사용한다.
    # -----------------------------------------------------------------------
    _THERMO_LAB_DEFAULTS = {
        'dc_thermo_lab1': {
            'page_class': 'page-system-lab1',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'layout_style': '',
            'overlay_store_key': 'thermo_lab1_overlay_boxes',
            'overlay_floor_key': 'thermo-future-5f',
        },
        'dc_thermo_lab2': {
            'page_class': 'page-system-lab2',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'layout_style': '',
            'overlay_store_key': 'thermo_lab2_overlay_boxes',
            'overlay_floor_key': 'thermo-future-6f',
        },
        'dc_thermo_lab3': {
            'page_class': 'page-system-lab3',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'layout_style': 'width:75%; margin:0 auto;',
            'overlay_store_key': 'thermo_lab3_overlay_boxes',
            'overlay_floor_key': 'thermo-eulji-15f',
        },
        'dc_thermo_lab4': {
            'page_class': 'page-system-lab4',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'layout_style': 'width:75%; margin:0 auto;',
            'overlay_store_key': 'thermo_lab4_overlay_boxes',
            'overlay_floor_key': 'thermo-drcenter-4f',
        },
    }
    if key in _THERMO_LAB_DEFAULTS or (key.startswith('dc_thermo_lab') and key not in ('dc_thermometer_list', 'dc_thermometer_log')):
        import json as _json_thermo
        _thermo_cfg = {}
        _tab = None
        try:
            _tab = PageTabConfig.query.filter(
                PageTabConfig.route_key == key,
                PageTabConfig.is_active == 1,
                PageTabConfig.is_deleted == 0,
            ).first()
            if _tab and _tab.extra_options:
                _thermo_cfg = _json_thermo.loads(_tab.extra_options) or {}
        except Exception:
            pass
        if not _thermo_cfg:
            _thermo_cfg = _THERMO_LAB_DEFAULTS.get(key, {})
        context['page_class'] = _thermo_cfg.get('page_class', 'page-system-lab')
        # 탭 제목을 center_name 으로 사용
        context['center_name'] = (_tab.tab_name if _tab and _tab.tab_name else _thermo_cfg.get('center_name', '배치도'))
        context['bg_image'] = _thermo_cfg.get('bg_image', '')
        context['layout_style'] = _thermo_cfg.get('layout_style', '')
        context['overlay_store_key'] = _thermo_cfg.get('overlay_store_key', '')
        context['overlay_floor_key'] = _thermo_cfg.get('overlay_floor_key', '')

    _CCTV_LAB_DEFAULTS = {
        'dc_cctv_lab1': {
            'page_class': 'page-cctv-lab1',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'api_base': '/api/system-lab1-cctvs',
            'overlay_store_key': 'cctv_lab1_overlay_boxes',
            'legacy_overlay_keys': ['thermo_lab1_overlay_boxes'],
        },
        'dc_cctv_lab2': {
            'page_class': 'page-cctv-lab2',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'api_base': '/api/system-lab2-cctvs',
            'overlay_store_key': 'cctv_lab2_overlay_boxes',
            'legacy_overlay_keys': ['thermo_lab2_overlay_boxes'],
        },
        'dc_cctv_lab3': {
            'page_class': 'page-cctv-lab3',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'api_base': '/api/system-lab3-cctvs',
            'overlay_store_key': 'cctv_lab3_overlay_boxes',
            'legacy_overlay_keys': ['thermo_lab3_overlay_boxes'],
        },
        'dc_cctv_lab4': {
            'page_class': 'page-cctv-lab4',
            'center_name': 'Sample Datacenter',
            'bg_image': '/static/image/center/sample/sample_datacenter.svg?v=20260413_4',
            'api_base': '/api/system-lab4-cctvs',
            'overlay_store_key': 'cctv_lab4_overlay_boxes',
            'legacy_overlay_keys': ['thermo_lab4_overlay_boxes'],
        },
    }
    if key in _CCTV_LAB_DEFAULTS or (key.startswith('dc_cctv_lab') and key != 'dc_cctv_list'):
        import json as _json_cctv
        _cctv_cfg = {}
        _tab = None
        try:
            _tab = PageTabConfig.query.filter(
                PageTabConfig.route_key == key,
                PageTabConfig.is_active == 1,
                PageTabConfig.is_deleted == 0,
            ).first()
            if _tab and _tab.extra_options:
                _cctv_cfg = _json_cctv.loads(_tab.extra_options) or {}
        except Exception:
            pass
        if not _cctv_cfg:
            _cctv_cfg = _CCTV_LAB_DEFAULTS.get(key, {})
        context['page_class'] = _cctv_cfg.get('page_class', 'page-cctv-lab')
        # 탭 제목을 center_name 으로 사용
        context['center_name'] = (_tab.tab_name if _tab and _tab.tab_name else _cctv_cfg.get('center_name', '배치도'))
        context['bg_image'] = _cctv_cfg.get('bg_image', '')
        context['api_base'] = _cctv_cfg.get('api_base', '')
        context['overlay_store_key'] = _cctv_cfg.get('overlay_store_key', '')
        context['legacy_overlay_keys'] = _cctv_cfg.get('legacy_overlay_keys', [])

    # ── tab72 계약정보(CAPEX) 공유 템플릿 ─────────────────────────────────
    # TEMPLATE_MAP이 직접 layouts/tab72-capex-shared.html을 가리킨다.
    # 페이지별 차이(뒤로가기, 탭 목록)는 컨텍스트 변수로 주입.
    _is_tab72_capex = (
        key.endswith('_contract')
        and key.startswith('cost_capex_')
    )
    if _is_tab72_capex:
        base_key = key[:-9] if key.endswith('_contract') else key
        back_key = 'cost_capex_contract'
        back_label = None

        tab_specs = [
            ('_detail', '기본정보'),
            ('_contract', '계약정보'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        _TAB72_BACK_LABEL_MAP = {
            'cost_capex_hardware': 'CAPEX 도입계약 목록으로 돌아가기',
            'cost_capex_software': 'CAPEX 도입계약 목록으로 돌아가기',
            'cost_capex_etc':      'CAPEX 도입계약 목록으로 돌아가기',
        }
        back_label = _TAB72_BACK_LABEL_MAP.get(base_key, 'CAPEX 도입계약 목록으로 돌아가기')

    # ── tab61 계약정보(OPEX) 공유 템플릿 ─────────────────────────────────
    # TEMPLATE_MAP이 직접 layouts/tab71-opex-shared.html을 가리킨다.
    # 페이지별 차이(뒤로가기, 탭 목록, detail JS 경로)는 컨텍스트 변수로 주입.
    _is_tab71_opex = (
        key.endswith('_contract')
        and key.startswith('cost_opex_')
    )
    if _is_tab71_opex:
        # base_key: cost_opex_hardware, cost_opex_software, cost_opex_etc
        base_key = key[:-9] if key.endswith('_contract') else key  # strip '_contract'
        back_key = base_key if base_key in TEMPLATE_MAP else None
        back_label = None

        # 도메인별 상세 JS 경로 매핑
        _TAB71_DETAIL_JS_MAP = {
            'cost_opex_hardware': '/static/js/7.cost/7-1.opex/7-1-1.hardware/2.hardware_detail.js?v=20251120-1',
            'cost_opex_software': '/static/js/7.cost/7-1.opex/7-1-2.software/2.software_detail.js?v=20260120-1',
            'cost_opex_etc':      '/static/js/7.cost/7-1.opex/7-1-3.etc/2.etc_detail.js?v=20260120-1',
        }
        context['tab71_detail_js'] = _TAB71_DETAIL_JS_MAP.get(base_key, '')

        # 탭 네비게이션 자동 생성
        tab_specs = [
            ('_detail', '기본정보'),
            ('_contract', '계약정보'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for suffix, label in tab_specs:
            tab_key = base_key + suffix
            if tab_key in TEMPLATE_MAP:
                tabs.append({'key': tab_key, 'label': label})

        # 뒤로가기 라벨 매핑
        _TAB61_BACK_LABEL_MAP = {
            'cost_opex_hardware': 'OPEX 하드웨어 목록으로 돌아가기',
            'cost_opex_software': 'OPEX 소프트웨어 목록으로 돌아가기',
            'cost_opex_etc':      'OPEX 기타 목록으로 돌아가기',
        }
        back_label = _TAB61_BACK_LABEL_MAP.get(base_key, '목록으로 돌아가기')

    # ── tab93 하드웨어 공통 컴포넌트 ─────────────────────────────────────
    # TEMPLATE_MAP이 직접 layouts/tab93-hardware-shared.html을 가리킨다.
    # 페이지별 차이(뒤로가기, 탭 목록, 컬럼 정의, 통계 설정)는 컨텍스트 변수로 주입.
    # ─────────────────────────────────────────────────────────────────────
    _TAB93_KEYS = {
        'cat_hw_server_hardware', 'cat_hw_storage_hardware', 'cat_hw_san_hardware',
        'cat_hw_network_hardware', 'cat_hw_security_hardware',
        'cat_vendor_manufacturer_hardware', 'cat_vendor_maintenance_hardware',
    }
    if key in _TAB93_KEYS:
        import json as _json_tab93

        # base_key: _hardware 접미사 제거
        _tab93_base = key.rsplit('_hardware', 1)[0]

        # 뒤로가기
        back_key = _tab93_base if _tab93_base in TEMPLATE_MAP else None
        if _tab93_base.startswith('cat_hw_'):
            back_label = '목록으로 돌아가기'
        elif _tab93_base.startswith('cat_vendor_'):
            back_label = '목록으로 돌아가기'

        # 탭 네비게이션 자동 생성
        _TAB93_SPECS = [
            ('_detail', '기본정보'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '컴포넌트'),
            ('_sla', 'SLA'),
            ('_issue', '이슈관리'),
            ('_task', '작업이력'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        for _suf93, _lbl93 in _TAB93_SPECS:
            _tk93 = _tab93_base + _suf93
            if _tk93 in TEMPLATE_MAP:
                tabs.append({'key': _tk93, 'label': _lbl93})

        # 컨텍스트별 컬럼/설정 — 공통값은 tab93 딕셔너리로 전달
        if _tab93_base.startswith('cat_hw_'):
            # 카테고리 > 하드웨어 (서버/스토리지/SAN/네트워크/보안장비)
            _tab93_columns = [
                {'key': 'category', 'label': '구분'},
                {'key': 'type', 'label': '유형'},
                {'key': 'work_operation', 'label': '업무운영'},
                {'key': 'work_group', 'label': '업무그룹'},
                {'key': 'work_name', 'label': '업무명', 'statusDot': True},
                {'key': 'system_name', 'label': '시스템명'},
                {'key': 'serial_number', 'label': '일련번호'},
                {'key': 'firmware', 'label': '펌웨어'},
                {'key': 'qty', 'label': '할당수량', 'numeric': True},
            ]
            context['tab93'] = {
                'data_context': 'hw-model-assets',
                'section_title': '모델별 하드웨어',
                'cols_class': 'cols-10',
                'columns': _tab93_columns,
                'columns_json': _json_tab93.dumps(_tab93_columns, ensure_ascii=False),
                'empty_desc': '해당 모델과 일치하는 하드웨어 자산이 없습니다.',
                'show_analytics': True,
                'analytics_subtitle': '구분별 유형 · 업무그룹 분포',
                'analytics_group': 'work_group',
                'csv_filename': 'hardware_model_assets',
            }
        elif key == 'cat_vendor_manufacturer_hardware':
            # 카테고리 > 벤더 > 제조사
            _tab93_columns = [
                {'key': 'category', 'label': '구분'},
                {'key': 'type', 'label': '유형'},
                {'key': 'model', 'label': '모델명'},
                {'key': 'work_name', 'label': '업무명', 'statusDot': True},
                {'key': 'system_name', 'label': '시스템명'},
                {'key': 'qty', 'label': '할당수량', 'numeric': True},
            ]
            context['tab93'] = {
                'data_context': 'vendor-hw-assets',
                'section_title': '제조사 하드웨어',
                'cols_class': 'cols-8',
                'columns': _tab93_columns,
                'columns_json': _json_tab93.dumps(_tab93_columns, ensure_ascii=False),
                'empty_desc': '해당 제조사와 일치하는 하드웨어 자산이 없습니다.',
                'show_analytics': True,
                'analytics_subtitle': '구분별 유형 · 모델명 분포',
                'analytics_group': 'model',
                'csv_filename': 'manufacturer_hardware_assets',
            }
        elif key == 'cat_vendor_maintenance_hardware':
            # 카테고리 > 벤더 > 유지보수사
            _tab93_columns = [
                {'key': 'category', 'label': '구분'},
                {'key': 'type', 'label': '유형'},
                {'key': 'model', 'label': '모델명'},
                {'key': 'serial', 'label': '일련번호'},
                {'key': 'work_name', 'label': '업무 이름', 'statusDot': True},
                {'key': 'system_name', 'label': '시스템 이름'},
                {'key': 'manage_no', 'label': '관리번호', 'contractDot': True},
                {'key': 'qty', 'label': '할당수량', 'numeric': True},
            ]
            context['tab93'] = {
                'data_context': 'maint-hw-assets',
                'section_title': '유지보수사 하드웨어',
                'cols_class': 'cols-9',
                'columns': _tab93_columns,
                'columns_json': _json_tab93.dumps(_tab93_columns, ensure_ascii=False),
                'empty_desc': '해당 유지보수사와 일치하는 OPEX 하드웨어 계약이 없습니다.',
                'show_analytics': False,
                'analytics_subtitle': '',
                'analytics_group': '',
                'csv_filename': 'maintenance_hw',
            }

    # ── tab94 소프트웨어 공통 컴포넌트 ─────────────────────────────────────
    # TEMPLATE_MAP이 직접 layouts/tab94-software-shared.html을 가리킨다.
    # 페이지별 차이(뒤로가기, 탭 목록, 컬럼 정의, 통계 설정)는 컨텍스트 변수로 주입.
    # ─────────────────────────────────────────────────────────────────────
    _TAB94_KEYS = {
        'cat_sw_os_system', 'cat_sw_database_system', 'cat_sw_middleware_system',
        'cat_sw_virtualization_system', 'cat_sw_security_system', 'cat_sw_high_availability_system',
        'cat_vendor_manufacturer_software', 'cat_vendor_maintenance_software',
    }
    if key in _TAB94_KEYS:
        import json as _json_tab94

        if key.startswith('cat_vendor_'):
            _tab94_base = key.rsplit('_software', 1)[0]
        else:
            _tab94_base = key.rsplit('_system', 1)[0]

        back_key = _tab94_base if _tab94_base in TEMPLATE_MAP else None
        if _tab94_base.startswith('cat_sw_'):
            back_label = '목록으로 돌아가기'
        elif _tab94_base.startswith('cat_vendor_'):
            back_label = '목록으로 돌아가기'

        _TAB94_SPECS = [
            ('_detail', '기본정보'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_system', '소프트웨어'),
            ('_software', '소프트웨어'),
            ('_component', '컴포넌트'),
            ('_sla', 'SLA'),
            ('_issue', '이슈관리'),
            ('_task', '작업이력'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ]
        tabs = []
        _seen_tab94 = set()
        for _suf94, _lbl94 in _TAB94_SPECS:
            _tk94 = _tab94_base + _suf94
            if _tk94 in TEMPLATE_MAP and _tk94 not in _seen_tab94:
                tabs.append({'key': _tk94, 'label': _lbl94})
                _seen_tab94.add(_tk94)

        if _tab94_base.startswith('cat_sw_'):
            _tab94_columns = [
                {'key': 'category', 'label': '구분'},
                {'key': 'type', 'label': '유형'},
                {'key': 'work_operation', 'label': '업무운영'},
                {'key': 'work_group', 'label': '업무그룹'},
                {'key': 'work_name', 'label': '업무명', 'statusDot': True},
                {'key': 'system_name', 'label': '시스템명'},
                {'key': 'serial_number', 'label': '일련번호'},
                {'key': 'detail_version', 'label': '상세버전'},
                {'key': 'qty', 'label': '할당수량', 'numeric': True},
            ]
            context['tab94'] = {
                'data_context': 'sw-model-assets',
                'section_title': '모델별 소프트웨어',
                'cols_class': 'cols-10',
                'columns': _tab94_columns,
                'columns_json': _json_tab94.dumps(_tab94_columns, ensure_ascii=False),
                'empty_desc': '해당 모델과 일치하는 소프트웨어 자산이 없습니다.',
                'show_analytics': True,
                'analytics_subtitle': '구분별 유형 · 업무그룹 분포',
                'analytics_group': 'work_group',
                'csv_filename': 'software_model_assets',
            }
        elif key == 'cat_vendor_manufacturer_software':
            _tab94_columns = [
                {'key': 'category', 'label': '구분'},
                {'key': 'type', 'label': '유형'},
                {'key': 'model', 'label': '모델명'},
                {'key': 'work_name', 'label': '업무명', 'statusDot': True},
                {'key': 'system_name', 'label': '시스템명'},
                {'key': 'qty', 'label': '할당수량', 'numeric': True},
            ]
            context['tab94'] = {
                'data_context': 'vendor-sw-assets',
                'section_title': '제조사 소프트웨어',
                'cols_class': 'cols-8',
                'columns': _tab94_columns,
                'columns_json': _json_tab94.dumps(_tab94_columns, ensure_ascii=False),
                'empty_desc': '해당 제조사와 일치하는 소프트웨어 자산이 없습니다.',
                'show_analytics': True,
                'analytics_subtitle': '구분별 유형 · 모델명 분포',
                'analytics_group': 'model',
                'csv_filename': 'manufacturer_software_assets',
            }
        elif key == 'cat_vendor_maintenance_software':
            _tab94_columns = [
                {'key': 'category', 'label': '구분'},
                {'key': 'type', 'label': '유형'},
                {'key': 'model', 'label': '모델명'},
                {'key': 'serial', 'label': '일련번호'},
                {'key': 'work_name', 'label': '업무 이름', 'statusDot': True},
                {'key': 'system_name', 'label': '시스템 이름'},
                {'key': 'manage_no', 'label': '관리번호', 'contractDot': True},
                {'key': 'qty', 'label': '할당수량', 'numeric': True},
            ]
            context['tab94'] = {
                'data_context': 'maint-sw-assets',
                'section_title': '유지보수사 소프트웨어',
                'cols_class': 'cols-9',
                'columns': _tab94_columns,
                'columns_json': _json_tab94.dumps(_tab94_columns, ensure_ascii=False),
                'empty_desc': '해당 유지보수사와 일치하는 OPEX 소프트웨어 계약이 없습니다.',
                'show_analytics': False,
                'analytics_subtitle': '',
                'analytics_group': '',
                'csv_filename': 'maintenance_sw',
            }

    # ── tab92 담당자 공통 템플릿 (업무 그룹) ───────────────────────────────
    _TAB92_KEYS = {
        'cat_business_group_manager',
    }
    if key in _TAB92_KEYS:
        _tab92_base = key.rsplit('_manager', 1)[0]
        back_key = _tab92_base if _tab92_base in TEMPLATE_MAP else None
        back_label = '목록으로 돌아가기'
        _tab92_order = ('_detail', '_manager', '_system', '_service', '_log', '_file')
        tabs = []
        for _suf92, _lbl92 in (
            ('_detail', '기본정보'),
            ('_manager', '담당자'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ):
            _tk92 = _tab92_base + _suf92
            if _tk92 in TEMPLATE_MAP:
                tabs.append({'key': _tk92, 'label': _lbl92})
        tabs.sort(key=lambda t: next((i for i, s in enumerate(_tab92_order) if t['key'].endswith(s)), 99))
        context['tab92'] = {
            'body_class': 'page-workgroup-manager',
            'section_title': '담당자 정보',
            'empty_title': '담당자 항목이 없습니다.',
            'empty_desc': "우측 상단 '추가' 버튼을 눌러 첫 담당자를 등록하세요.",
        }

    # ── tab96 서비스 공통 템플릿 (업무 그룹) ───────────────────────────────
    _TAB96_KEYS = {
        'cat_business_group_service',
    }
    if key in _TAB96_KEYS:
        _tab96_base = key.rsplit('_service', 1)[0]
        back_key = _tab96_base if _tab96_base in TEMPLATE_MAP else None
        back_label = '목록으로 돌아가기'
        _tab96_order = ('_detail', '_manager', '_system', '_service', '_log', '_file')
        tabs = []
        for _suf96, _lbl96 in (
            ('_detail', '기본정보'),
            ('_manager', '담당자'),
            ('_system', '시스템'),
            ('_service', '서비스'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ):
            _tk96 = _tab96_base + _suf96
            if _tk96 in TEMPLATE_MAP:
                tabs.append({'key': _tk96, 'label': _lbl96})
        tabs.sort(key=lambda t: next((i for i, s in enumerate(_tab96_order) if t['key'].endswith(s)), 99))
        context['tab96'] = {
            'body_class': 'page-workgroup-service',
            'section_title': '서비스',
            'empty_title': '서비스 항목이 없습니다.',
            'empty_desc': '-',
        }

    # ── tab97 파트너 담당자 공통 템플릿 (제조사 / 유지보수사 / VPN / 전용회선) ──
    _TAB97_KEYS = {
        'cat_vendor_manufacturer_manager',
        'cat_vendor_maintenance_manager',
        'gov_vpn_policy_manager',
        'gov_vpn_policy2_manager',
        'gov_vpn_policy3_manager',
        'gov_vpn_policy4_manager',
        'gov_vpn_policy5_manager',
        'gov_dedicatedline_member_manager',
        'gov_dedicatedline_customer_manager',
        'gov_dedicatedline_van_manager',
        'gov_dedicatedline_affiliate_manager',
        'gov_dedicatedline_intranet_manager',
    }
    if key in _TAB97_KEYS:
        _tab97_base = key.rsplit('_manager', 1)[0]
        back_key = _tab97_base if _tab97_base in TEMPLATE_MAP else None
        _tab97_body_class = None
        _tab97_mode = None
        _tab97_specs = None
        _tab97_columns = None
        _tab97_extra_scripts = []

        if _tab97_base == 'cat_vendor_manufacturer':
            back_label = '목록으로 돌아가기'
            _tab97_specs = (
                ('_detail', '기본정보'),
                ('_manager', '담당자'),
                ('_hardware', '하드웨어'),
                ('_software', '소프트웨어'),
                ('_component', '컴포넌트'),
                ('_task', '작업이력'),
                ('_log', '변경이력'),
                ('_file', '구성/파일'),
            )
            _tab97_body_class = 'page-vendor-manufacturer-manager'
            _tab97_mode = 'manufacturer'
        elif _tab97_base == 'cat_vendor_maintenance':
            back_label = '목록으로 돌아가기'
            _tab97_specs = (
                ('_detail', '기본정보'),
                ('_manager', '담당자'),
                ('_hardware', '하드웨어'),
                ('_software', '소프트웨어'),
                ('_component', '컴포넌트'),
                ('_sla', 'SLA'),
                ('_issue', '이슈관리'),
                ('_task', '작업이력'),
                ('_log', '변경이력'),
                ('_file', '구성/파일'),
            )
            _tab97_body_class = 'page-vendor-maintenance-manager'
            _tab97_mode = 'maintenance'
        elif _tab97_base.startswith('gov_vpn_policy'):
            back_label = '목록으로 돌아가기'
            _tab97_specs = (
                ('_detail', '기본정보'),
                ('_manager', '담당자'),
                ('_communication', '통신정책'),
                ('_vpn_policy', '상세설정'),
                ('_log', '변경이력'),
                ('_file', '구성/파일'),
            )
            _tab97_body_class = 'page-vpn-manager'
            _tab97_mode = 'vpn'
            _tab97_columns = ['소속', '이름', '담당', '연락처', '이메일', '비고']
        elif _tab97_base.startswith('gov_dedicatedline_'):
            back_label = '목록으로 돌아가기'
            _tab97_specs = (
                ('_detail', '기본정보'),
                ('_manager', '담당자'),
                ('_task', '작업이력'),
                ('_log', '변경이력'),
                ('_file', '구성/파일'),
            )
            _tab97_body_class = 'page-dedicatedline-manager'
            _tab97_mode = 'dedicatedline'
            _tab97_columns = ['소속', '이름', '담당', '연락처', '이메일', '비고']
            _tab97_extra_scripts = ['/static/js/4.governance/4-5.dedicatedline_policy/dedicatedline_header.js?v=1.0']

        tabs = []
        for _suf97, _lbl97 in (_tab97_specs or ()):
            _tk97 = _tab97_base + _suf97
            if _tk97 in TEMPLATE_MAP:
                tabs.append({'key': _tk97, 'label': _lbl97})
        _tab97_ctx = {
            'body_class': _tab97_body_class or 'page-vendor-manufacturer-manager',
            'mode': _tab97_mode or 'manufacturer',
            'section_title': '담당자 정보',
            'empty_title': '담당자 항목이 없습니다.',
            'empty_desc': "우측 상단 '추가' 버튼을 눌러 첫 담당자를 등록하세요.",
        }
        if _tab97_columns:
            _tab97_ctx['columns'] = _tab97_columns
        if _tab97_extra_scripts:
            _tab97_ctx['extra_scripts'] = _tab97_extra_scripts
        context['tab97'] = _tab97_ctx

    # ── tab98 SLA 공통 템플릿 (유지보수사) ────────────────────────────────
    _TAB98_KEYS = {
        'cat_vendor_maintenance_sla',
    }
    if key in _TAB98_KEYS:
        _tab98_base = key.rsplit('_sla', 1)[0]
        back_key = _tab98_base if _tab98_base in TEMPLATE_MAP else None
        back_label = '목록으로 돌아가기'
        tabs = []
        for _suf98, _lbl98 in (
            ('_detail', '기본정보'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '컴포넌트'),
            ('_sla', 'SLA'),
            ('_issue', '이슈관리'),
            ('_task', '작업이력'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ):
            _tk98 = _tab98_base + _suf98
            if _tk98 in TEMPLATE_MAP:
                tabs.append({'key': _tk98, 'label': _lbl98})
        context['tab98'] = {
            'body_class': 'page-vendor-maintenance-sla',
            'section_title': 'SLA 항목',
            'empty_title': 'SLA 항목이 없습니다.',
            'empty_desc': "우측 상단 '행 추가' 버튼으로 첫 SLA 항목을 등록하세요.",
        }

    # ── tab99 이슈관리 공통 템플릿 (유지보수사) ───────────────────────────
    _TAB99_KEYS = {
        'cat_vendor_maintenance_issue',
    }
    if key in _TAB99_KEYS:
        _tab99_base = key.rsplit('_issue', 1)[0]
        back_key = _tab99_base if _tab99_base in TEMPLATE_MAP else None
        back_label = '목록으로 돌아가기'
        tabs = []
        for _suf99, _lbl99 in (
            ('_detail', '기본정보'),
            ('_manager', '담당자'),
            ('_hardware', '하드웨어'),
            ('_software', '소프트웨어'),
            ('_component', '컴포넌트'),
            ('_sla', 'SLA'),
            ('_issue', '이슈관리'),
            ('_task', '작업이력'),
            ('_log', '변경이력'),
            ('_file', '구성/파일'),
        ):
            _tk99 = _tab99_base + _suf99
            if _tk99 in TEMPLATE_MAP:
                tabs.append({'key': _tk99, 'label': _lbl99})
        context['tab99'] = {
            'body_class': 'page-vendor-maintenance-issue',
            'section_title': '이슈관리',
            'empty_title': '이슈 내역이 없습니다.',
            'empty_desc': "우측 상단 '행 추가' 버튼으로 첫 이슈를 등록하세요.",
        }

    # ── 카테고리 > 컴포넌트 상세(기본정보) 페이지 탭 빌드 ───────────────
    # 2.*_detail.html 은 공유 템플릿 핸들러(tab95 등)를 거치지 않으므로
    # tabs 가 미설정 — 여기서 직접 생성한다.
    if (
        'tabs' not in dir()
        and _is_cat_tab_key(key)
        and _cat_base_key(key) in _COMPONENT_DETAIL_KEYS
    ):
        _comp_base = _cat_base_key(key)
        _comp_tab_order_d = ('_detail', '_system', '_task', '_log', '_file')
        _comp_tab_labels_d = {
            '_detail': '기본정보',
            '_system': '컴포넌트',
            '_task': '작업이력',
            '_log': '변경이력',
            '_file': '구성/파일',
        }
        tabs = []
        for _suf_d in _comp_tab_order_d:
            _tk_d = _comp_base + _suf_d
            if _tk_d in TEMPLATE_MAP:
                tabs.append({'key': _tk_d, 'label': _comp_tab_labels_d[_suf_d]})
        back_key = _comp_base if _comp_base in TEMPLATE_MAP else None
        back_label = '목록으로 돌아가기'

    return render_template(
        template,
        current_key=key,
        menu_code=_resolve_menu_code(key),
        title=title,
        subtitle=subtitle,
        hw_asset_id=hw_asset_id,
        hw_asset_scope=hw_asset_scope,
        detail_manage_no=detail_manage_no,
        detail_token=detail_token,
        detail_entity_key=detail_entity_key,
        detail_contract=detail_contract,
        rack_code=rack_code,
        back_key=locals().get('back_key'),
        back_label=locals().get('back_label'),
        tabs=locals().get('tabs'),
        **context,
    )

