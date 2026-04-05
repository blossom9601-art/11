"""카테고리 하드웨어 / 소프트웨어 대시보드 데이터 집계 서비스."""
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def _today_str():
    return datetime.utcnow().strftime('%Y-%m-%d')


def _classify_eosl(eosl_date_str, today=None):
    """EOSL 날짜 문자열 → 'expired' | 'imminent' | 'healthy' | 'unknown'"""
    if not eosl_date_str or not eosl_date_str.strip():
        return 'unknown'
    today = today or datetime.utcnow().date()
    try:
        eosl = datetime.strptime(eosl_date_str.strip()[:10], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return 'unknown'
    if eosl < today:
        return 'expired'
    if eosl <= today + timedelta(days=30):
        return 'imminent'
    return 'healthy'


def _aggregate_hw(rows):
    """hw type rows → dashboard dict."""
    today = datetime.utcnow().date()
    total = len(rows)
    eosl_stats = {'healthy': 0, 'imminent': 0, 'expired': 0, 'unknown': 0}
    vendor_counts = {}
    type_counts = {}
    risk_items = []

    for r in rows:
        cls = _classify_eosl(r.get('eosl_date'), today)
        eosl_stats[cls] += 1
        vendor = r.get('manufacturer_code') or r.get('vendor') or '미정'
        vendor_counts[vendor] = vendor_counts.get(vendor, 0) + 1
        hw_type = r.get('_resolved_type') or r.get('form_factor') or ''
        if not hw_type:
            hw_type = '기타'
        type_counts[hw_type] = type_counts.get(hw_type, 0) + 1
        if cls in ('expired', 'imminent'):
            model = r.get('model_name') or r.get('model') or ''
            risk_items.append({
                'id': r.get('id'),
                'model': model,
                'vendor': vendor,
                'hw_type': hw_type,
                'eosl_date': r.get('eosl_date') or '',
                'status': cls,
            })

    risk_items.sort(key=lambda x: x.get('eosl_date') or '9999')
    # 모델명 중복 제거 (가장 이른 EOSL 날짜 유지)
    seen_models = set()
    unique_risk = []
    for item in risk_items:
        if item['model'] not in seen_models:
            seen_models.add(item['model'])
            unique_risk.append(item)
    return {
        'total': total,
        'eosl': eosl_stats,
        'vendors': [{'name': k, 'count': v} for k, v in sorted(vendor_counts.items(), key=lambda x: -x[1])],
        'types': [{'name': k, 'count': v} for k, v in sorted(type_counts.items(), key=lambda x: -x[1])],
        'risk_top': unique_risk[:5],
    }


def _aggregate_sw(rows, type_field='os_type'):
    """sw type rows → dashboard dict."""
    today = datetime.utcnow().date()
    total = len(rows)
    eosl_stats = {'healthy': 0, 'imminent': 0, 'expired': 0, 'unknown': 0}
    vendor_counts = {}
    sw_type_counts = {}
    risk_items = []

    for r in rows:
        cls = _classify_eosl(r.get('eosl_date'), today)
        eosl_stats[cls] += 1
        vendor = r.get('manufacturer_code') or r.get('vendor') or '미정'
        vendor_counts[vendor] = vendor_counts.get(vendor, 0) + 1
        sw_type = r.get('_resolved_type') or r.get(type_field) or ''
        if not sw_type:
            sw_type = '기타'
        sw_type_counts[sw_type] = sw_type_counts.get(sw_type, 0) + 1
        if cls in ('expired', 'imminent'):
            model = r.get('model_name') or r.get('model') or ''
            risk_items.append({
                'id': r.get('id'),
                'model': model,
                'vendor': vendor,
                'sw_type': sw_type,
                'eosl_date': r.get('eosl_date') or '',
                'status': cls,
            })

    risk_items.sort(key=lambda x: x.get('eosl_date') or '9999')
    seen_models = set()
    unique_risk = []
    for item in risk_items:
        if item['model'] not in seen_models:
            seen_models.add(item['model'])
            unique_risk.append(item)
    return {
        'total': total,
        'eosl': eosl_stats,
        'vendors': [{'name': k, 'count': v} for k, v in sorted(vendor_counts.items(), key=lambda x: -x[1])],
        'types': [{'name': k, 'count': v} for k, v in sorted(sw_type_counts.items(), key=lambda x: -x[1])],
        'risk_top': unique_risk[:5],
    }


def compute_hw_dashboard():
    """하드웨어 카테고리 대시보드 통합 데이터."""
    from app.services.hw_server_type_service import list_hw_server_types
    from app.services.hw_storage_type_service import list_hw_storage_types
    from app.services.hw_san_type_service import list_hw_san_types
    from app.services.hw_network_type_service import list_hw_network_types
    from app.services.hw_security_type_service import list_hw_security_types

    _HW_TYPE_FIELDS = {
        'server': 'form_factor',
        'storage': 'storage_type',
        'san': 'san_type',
        'network': 'network_type',
        'security': 'security_type',
    }
    sections = {}
    all_rows = []
    for key, fetcher in [
        ('server', list_hw_server_types),
        ('storage', list_hw_storage_types),
        ('san', list_hw_san_types),
        ('network', list_hw_network_types),
        ('security', list_hw_security_types),
    ]:
        try:
            rows = fetcher(include_deleted=False) or []
        except Exception:
            logger.exception('Failed to fetch %s types for HW dashboard', key)
            rows = []
        type_col = _HW_TYPE_FIELDS[key]
        for r in rows:
            r['_resolved_type'] = r.get(type_col) or ''
        sections[key] = _aggregate_hw(rows)
        all_rows.extend(rows)

    summary = _aggregate_hw(all_rows)
    return {'summary': summary, 'sections': sections}


def compute_sw_dashboard():
    """소프트웨어 카테고리 대시보드 통합 데이터."""
    from app.services.sw_os_type_service import list_sw_os_types
    from app.services.sw_db_type_service import list_sw_db_types
    from app.services.sw_middleware_type_service import list_sw_middleware_types
    from app.services.sw_virtual_type_service import list_sw_virtual_types
    from app.services.sw_security_type_service import list_sw_security_types
    from app.services.sw_high_availability_type_service import list_sw_ha_types

    _SW_TYPE_FIELDS = {
        'os': 'os_type',
        'database': 'db_type',
        'middleware': 'mw_type',
        'virtualization': 'virtual_type',
        'security': 'security_type',
        'high_availability': 'ha_type',
    }
    sections = {}
    all_rows = []
    for key, fetcher in [
        ('os', list_sw_os_types),
        ('database', list_sw_db_types),
        ('middleware', list_sw_middleware_types),
        ('virtualization', list_sw_virtual_types),
        ('security', list_sw_security_types),
        ('high_availability', list_sw_ha_types),
    ]:
        try:
            rows = fetcher(include_deleted=False) or []
        except Exception:
            logger.exception('Failed to fetch %s types for SW dashboard', key)
            rows = []
        type_col = _SW_TYPE_FIELDS[key]
        for r in rows:
            r['_resolved_type'] = r.get(type_col) or ''
        sections[key] = _aggregate_sw(rows, type_field=_SW_TYPE_FIELDS.get(key, 'sw_type'))
        all_rows.extend(rows)

    summary = _aggregate_sw(all_rows)
    return {'summary': summary, 'sections': sections}
