from flask import Blueprint, jsonify, request

from app.services.hw_activate_service import (
    create_hw_activate,
    delete_hw_activate,
    get_hw_activate,
    init_hw_activate_table,
    list_hw_activates,
    update_hw_activate,
)

hw_activate_api_bp = Blueprint('hw_activate_api', __name__)


@hw_activate_api_bp.before_app_request
def _ensure_table() -> None:
    try:
        init_hw_activate_table()
    except Exception:
        pass


@hw_activate_api_bp.route('/api/hw-activates', methods=['GET'])
def list_activates():
    try:
        scope_key = (request.args.get('scope_key') or '').strip()
        asset_id = request.args.get('asset_id')
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 500
        data = list_hw_activates(scope_key, int(asset_id), page=int(page), page_size=int(page_size))
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_activate_api_bp.route('/api/hw-activates', methods=['POST'])
def create_activate():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_hw_activate(payload, actor=actor)
        from app.routes.api import _try_record_change
        _try_record_change(
            action_type='CREATE',
            entity_type='hardware_asset',
            entity_id=payload.get('asset_id'),
            tab_name='기동절차',
            new_data=row,
            summary='기동절차 추가: ' + (row.get('svc_name') or row.get('svc_type') or ''),
        )
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_activate_api_bp.route('/api/hw-activates/<int:activate_id>', methods=['PUT'])
def update_activate(activate_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        old_data = get_hw_activate(activate_id)
        row = update_hw_activate(activate_id, payload, actor=actor)
        from app.routes.api import _try_record_change
        _try_record_change(
            action_type='UPDATE',
            entity_type='hardware_asset',
            entity_id=row.get('asset_id'),
            tab_name='기동절차',
            old_data=old_data,
            new_data=row,
        )
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_activate_api_bp.route('/api/hw-activates/<int:activate_id>', methods=['DELETE'])
def delete_activate(activate_id: int):
    try:
        old_data = get_hw_activate(activate_id)
        asset_id = old_data.get('asset_id') if old_data else None
        label = (old_data.get('svc_name') or old_data.get('svc_type') or '') if old_data else ''
        delete_hw_activate(activate_id)
        from app.routes.api import _try_record_change
        _try_record_change(
            action_type='DELETE',
            entity_type='hardware_asset',
            entity_id=asset_id,
            tab_name='기동절차',
            old_data=old_data,
            summary='기동절차 삭제: ' + label,
        )
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
