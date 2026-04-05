from flask import Blueprint, jsonify, request

from app.services.hw_interface_service import (
    create_hw_interface,
    delete_hw_interface,
    get_hw_interface,
    init_hw_interface_table,
    list_hw_interfaces,
    lookup_interfaces_by_ips,
    update_hw_interface,
)

hw_interface_api_bp = Blueprint('hw_interface_api', __name__)


@hw_interface_api_bp.before_app_request
def _ensure_table() -> None:
    # Lightweight guard: CREATE TABLE IF NOT EXISTS is idempotent.
    # Keeps dev envs working even if create_app init list is missed.
    try:
        init_hw_interface_table()
    except Exception:
        # Don't block requests; errors will surface on actual DB ops.
        pass


@hw_interface_api_bp.route('/api/hw-interfaces', methods=['GET'])
def list_interfaces():
    try:
        scope_key = (request.args.get('scope_key') or '').strip()
        asset_id = request.args.get('asset_id')
        work_name = (request.args.get('work_name') or '').strip()
        if not asset_id and not work_name:
            raise ValueError('asset_id 또는 work_name이 필요합니다.')
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 500
        data = list_hw_interfaces(
            scope_key,
            int(asset_id) if asset_id else 0,
            page=int(page),
            page_size=int(page_size),
            work_name=work_name or None,
        )
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_interface_api_bp.route('/api/hw-interfaces', methods=['POST'])
def create_interface():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_hw_interface(payload, actor=actor)
        # 변경이력 기록
        from app.routes.api import _try_record_change
        _try_record_change(
            action_type='CREATE',
            entity_type='hardware_asset',
            entity_id=payload.get('asset_id'),
            tab_name='인터페이스',
            new_data=row,
            summary='인터페이스 추가: ' + (row.get('iface') or row.get('type') or ''),
        )
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_interface_api_bp.route('/api/hw-interfaces/<int:interface_id>', methods=['PUT'])
def update_interface(interface_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        old_data = get_hw_interface(interface_id)
        row = update_hw_interface(interface_id, payload, actor=actor)
        # 변경이력 기록
        from app.routes.api import _try_record_change
        _try_record_change(
            action_type='UPDATE',
            entity_type='hardware_asset',
            entity_id=row.get('asset_id'),
            tab_name='인터페이스',
            old_data=old_data,
            new_data=row,
        )
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_interface_api_bp.route('/api/hw-interfaces/<int:interface_id>', methods=['DELETE'])
def delete_interface(interface_id: int):
    try:
        old_data = get_hw_interface(interface_id)
        asset_id = old_data.get('asset_id') if old_data else None
        iface_name = (old_data.get('iface') or old_data.get('type') or '') if old_data else ''
        delete_hw_interface(interface_id)
        # 변경이력 기록
        from app.routes.api import _try_record_change
        _try_record_change(
            action_type='DELETE',
            entity_type='hardware_asset',
            entity_id=asset_id,
            tab_name='인터페이스',
            old_data=old_data,
            summary='인터페이스 삭제: ' + iface_name,
        )
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_interface_api_bp.route('/api/hw-interfaces/lookup-by-ips', methods=['POST'])
def lookup_by_ips():
    """Given a list of IPs, return {ip: {system_name, port}} from hw_interface records."""
    try:
        payload = request.get_json(silent=True) or {}
        ips = payload.get('ips') or []
        if not isinstance(ips, list):
            ips = [str(ips)]
        ips = [str(ip).strip() for ip in ips if ip and str(ip).strip()][:500]
        result = lookup_interfaces_by_ips(ips)
        return jsonify({'success': True, 'mapping': result})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
