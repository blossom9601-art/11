from flask import Blueprint, jsonify, request

from app.services.sw_system_allocation_service import (
    bulk_delete_sw_system_allocations,
    create_sw_system_allocation,
    delete_sw_system_allocation,
    init_sw_system_allocation_table,
    list_sw_system_allocations,
    update_sw_system_allocation,
)

sw_system_allocation_api_bp = Blueprint('sw_system_allocation_api', __name__)


@sw_system_allocation_api_bp.before_app_request
def _ensure_table() -> None:
    try:
        init_sw_system_allocation_table()
    except Exception:
        pass


@sw_system_allocation_api_bp.route('/api/sw-system-allocations', methods=['GET'])
def list_allocations():
    try:
        scope_key = (request.args.get('scope_key') or '').strip()
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 500
        data = list_sw_system_allocations(scope_key, page=int(page), page_size=int(page_size))
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@sw_system_allocation_api_bp.route('/api/sw-system-allocations', methods=['POST'])
def create_allocation():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_sw_system_allocation(payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@sw_system_allocation_api_bp.route('/api/sw-system-allocations/<int:allocation_id>', methods=['PUT'])
def update_allocation(allocation_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_sw_system_allocation(allocation_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@sw_system_allocation_api_bp.route('/api/sw-system-allocations/<int:allocation_id>', methods=['DELETE'])
def delete_allocation(allocation_id: int):
    try:
        scope_key = (request.args.get('scope_key') or '').strip()
        delete_sw_system_allocation(allocation_id, scope_key=scope_key)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@sw_system_allocation_api_bp.route('/api/sw-system-allocations/bulk-delete', methods=['POST'])
def bulk_delete_allocations():
    try:
        payload = request.get_json(silent=True) or {}
        scope_key = (payload.get('scope_key') or '').strip()
        ids = payload.get('ids') or []
        data = bulk_delete_sw_system_allocations(scope_key, ids)
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
