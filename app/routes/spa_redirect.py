"""MPA key → SPA path redirect resolver."""
from __future__ import annotations

from typing import Callable, Optional


# ── MPA list/special page key → SPA path ──
_EXACT: dict[str, str] = {
    # Dashboard
    'dashboard': '/',

    # Insight
    'insight_trend': '/insight/trend',
    'insight_security': '/insight/security',
    'insight_report': '/insight/report',
    'insight_technical': '/insight/technical',
    'insight_blog_it': '/insight/blog',

    # Hardware — Server
    'hw_server_onpremise': '/hardware/onpremise',
    'hw_server_cloud': '/hardware/cloud',
    'hw_server_frame': '/hardware/frame',
    'hw_server_workstation': '/hardware/workstation',

    # Hardware — Storage
    'hw_storage_san': '/hardware/san',
    'hw_storage_backup': '/hardware/backup-storage',

    # Hardware — SAN
    'hw_san_director': '/hardware/san-director',
    'hw_san_switch': '/hardware/san-switch',

    # Network
    'hw_network_l2': '/network/l2',
    'hw_network_l4': '/network/l4',
    'hw_network_l7': '/network/l7',
    'hw_network_ap': '/network/ap',
    'hw_network_dedicateline': '/network/dedicateline',

    # Security
    'hw_security_firewall': '/security/firewall',
    'hw_security_vpn': '/security/vpn',
    'hw_security_ids': '/security/ids',
    'hw_security_ips': '/security/ips',
    'hw_security_hsm': '/security/hsm',
    'hw_security_kms': '/security/kms',
    'hw_security_wips': '/security/wips',
    'hw_security_etc': '/security/etc',

    # Governance
    'gov_dr_training': '/governance/dr-training',
    'gov_backup_dashboard': '/governance/backup',
    'gov_backup_policy': '/governance/backup/policies',
    'gov_backup_tape': '/governance/backup/tapes',
    'gov_package_dashboard': '/governance/packages',
    'gov_package_list': '/governance/packages/list',
    'gov_package_vulnerability': '/governance/package-vulnerabilities',
    'gov_vulnerability_dashboard': '/governance/vulnerability',
    'gov_vulnerability_analysis': '/governance/vulnerability/analysis',
    'gov_vulnerability_guide': '/governance/vulnerability/guide',
    'gov_ip_policy': '/governance/ip',
    'gov_dns_policy': '/governance/dns',
    'gov_ad_policy': '/governance/ad',
    'gov_vpn_policy': '/governance/vpn/partners',
    'gov_vpn_policy2': '/governance/vpn/partners',
    'gov_vpn_policy3': '/governance/vpn/partners',
    'gov_vpn_policy4': '/governance/vpn/partners',
    'gov_vpn_policy5': '/governance/vpn/partners',
    'gov_dedicatedline_member': '/governance/leased-line',
    'gov_dedicatedline_customer': '/governance/leased-line',
    'gov_dedicatedline_van': '/governance/leased-line',
    'gov_dedicatedline_affiliate': '/governance/leased-line',
    'gov_dedicatedline_intranet': '/governance/leased-line',
    'gov_unused_hardware': '/governance/unused-assets',
    'gov_unused_server': '/governance/unused-assets',
    'gov_unused_storage': '/governance/unused-assets',
    'gov_unused_san': '/governance/unused-assets',
    'gov_unused_network': '/governance/unused-assets',
    'gov_unused_security': '/governance/unused-assets',
    'gov_unused_software': '/governance/unused-assets',

    # Datacenter
    'dc_access_control': '/datacenter/access/control',
    'dc_access_records': '/datacenter/access/records',
    'dc_authority_control': '/datacenter/access/authority-records',
    'dc_authority_records': '/datacenter/access/authority-records',
    'dc_access_system': '/datacenter/access/systems',
    'dc_data_deletion': '/datacenter/deletion',
    'dc_data_deletion_system': '/datacenter/deletion/systems',
    'dc_rack_lab1': '/datacenter/rack/layout/1',
    'dc_rack_lab2': '/datacenter/rack/layout/2',
    'dc_rack_lab3': '/datacenter/rack/layout/3',
    'dc_rack_lab4': '/datacenter/rack/layout/4',
    'dc_rack_list': '/datacenter/rack/list',
    'dc_rack_detail': '/datacenter/rack',
    'dc_thermo_lab1': '/datacenter/thermometer/lab/1',
    'dc_thermo_lab2': '/datacenter/thermometer/lab/2',
    'dc_thermo_lab3': '/datacenter/thermometer/lab/3',
    'dc_thermo_lab4': '/datacenter/thermometer/lab/4',
    'dc_thermometer_list': '/datacenter/thermometer',
    'dc_thermometer_log': '/datacenter/thermometer/log',
    'dc_cctv_lab1': '/datacenter/cctv/lab/1',
    'dc_cctv_lab2': '/datacenter/cctv/lab/2',
    'dc_cctv_lab3': '/datacenter/cctv/lab/3',
    'dc_cctv_lab4': '/datacenter/cctv/lab/4',
    'dc_cctv_list': '/datacenter/cctv',

    # Cost
    'cost_opex_dashboard': '/cost/dashboard/opex',
    'cost_opex_hardware': '/cost/opex-hardware',
    'cost_opex_software': '/cost/opex-software',
    'cost_opex_etc': '/cost/opex-etc',
    'cost_capex_hardware': '/cost/capex-hardware',
    'cost_capex_software': '/cost/capex-software',
    'cost_capex_etc': '/cost/capex-etc',
    'cost_capex_dashboard': '/cost/dashboard/capex',
    'cost_capex_contract': '/cost/capex/contract',

    # Maintenance
    'maint_contract_list': '/maintenance/contract',

    # Project
    'proj_status': '/project',
    'proj_participating': '/project/my',
    'proj_cleared': '/project',
    'proj_completed': '/project',

    # Task & Workflow
    'task_status': '/work/tasks',
    'task_participating': '/work/tasks',
    'task_overview': '/work/tasks',
    'task_completed': '/work/tasks',
    'workflow_progress': '/work/workflows',
    'workflow_completed': '/work/desk/completed',
    'wf_designer_explore': '/work/designer',
    'wf_designer_manage': '/work/designer',
    'wf_designer_editor': '/work/designer',

    # Category — Business
    'cat_business_dashboard': '/category/business',
    'cat_business_work': '/category/business/work',
    'cat_business_division': '/category/business/division',
    'cat_business_status': '/category/business/status',
    'cat_business_operation': '/category/business/operation',
    'cat_business_group': '/category/business/group',

    # Category — Hardware
    'cat_hw_dashboard': '/category/hardware',
    'cat_hw_server': '/category/hardware',
    'cat_hw_storage': '/category/hardware',
    'cat_hw_san': '/category/hardware',
    'cat_hw_network': '/category/hardware',
    'cat_hw_security': '/category/hardware',

    # Category — Software
    'cat_sw_dashboard': '/category/software',
    'cat_sw_os': '/category/software',
    'cat_sw_database': '/category/software',
    'cat_sw_middleware': '/category/software',
    'cat_sw_virtualization': '/category/software',
    'cat_sw_security': '/category/software',
    'cat_sw_high_availability': '/category/software',

    # Category — Components
    'cat_component_cpu': '/category/component',
    'cat_component_gpu': '/category/component',
    'cat_component_memory': '/category/component',
    'cat_component_disk': '/category/component',
    'cat_component_nic': '/category/component',
    'cat_component_hba': '/category/component',
    'cat_component_etc': '/category/component',

    # Category — Organization & Customer
    'cat_company_center': '/category/organization',
    'cat_company_department': '/category/organization',
    'cat_customer_client1': '/category/customer',

    # Category — Vendor
    'cat_vendor_manufacturer': '/category/vendor',
    'cat_vendor_maintenance': '/category/vendor',

    # Settings / Admin
    'settings_info_message': '/admin/info-messages',
    'settings_version': '/settings/version',
    'help': '/settings/help',
    'privacy': '/settings/privacy',
}

# Tab suffixes to strip (longest first to avoid partial matches)
_TAB_SUFFIXES = [
    '_vpn_policy', '_ip_range', '_dns_record',
    '_communication', '_vulnerability', '_firewalld',
    '_authority', '_activate', '_frontbay', '_rearbay',
    '_hardware', '_software', '_component',
    '_backup', '_storage', '_account', '_package',
    '_manager', '_service', '_contract', '_integrity',
    '_system', '_domain',
    '_detail', '_basic', '_assign', '_zone',
    '_scope', '_schedule', '_cost', '_quality',
    '_resource', '_procurement', '_stakeholder', '_risk',
    '_sla', '_issue',
    '_task', '_file', '_log', '_hw', '_sw', '_if',
]


def resolve_spa_redirect(
    key: str,
    token: Optional[str] = None,
    *,
    decode_fn: Optional[Callable] = None,
) -> Optional[str]:
    """Return SPA path for *key*, or ``None`` to skip redirect."""
    # 1) exact match (list / standalone pages)
    spa = _EXACT.get(key)
    if spa is not None:
        return spa

    # 2) strip tab/detail suffix → find parent list key
    for suffix in _TAB_SUFFIXES:
        if key.endswith(suffix):
            parent = key[: -len(suffix)]
            spa = _EXACT.get(parent)
            if spa is not None:
                asset_id = _decode(token, decode_fn)
                return f'{spa}/{asset_id}' if asset_id else spa

    return None


def _decode(token: Optional[str], fn: Optional[Callable]) -> Optional[str]:
    if not token or not fn:
        return None
    try:
        return fn(token)
    except Exception:
        return None
