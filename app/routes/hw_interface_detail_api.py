from flask import Blueprint, jsonify, request

from app.services.hw_interface_detail_service import (
    create_interface_detail,
    delete_interface_detail,
    get_interface_detail,
    init_hw_interface_detail_table,
    list_interface_details,
    update_interface_detail,
)

hw_interface_detail_api_bp = Blueprint('hw_interface_detail_api', __name__)


@hw_interface_detail_api_bp.before_app_request
def _ensure_table() -> None:
    try:
        init_hw_interface_detail_table()
    except Exception:
        pass


@hw_interface_detail_api_bp.route('/api/hw-interface-details', methods=['GET'])
def list_details():
    try:
        interface_id = request.args.get('interface_id')
        if not interface_id:
            raise ValueError('interface_id가 필요합니다.')
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 500
        data = list_interface_details(
            int(interface_id),
            page=int(page),
            page_size=int(page_size),
        )
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_interface_detail_api_bp.route('/api/hw-interface-details', methods=['POST'])
def create_detail():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_interface_detail(payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_interface_detail_api_bp.route('/api/hw-interface-details/<int:detail_id>', methods=['PUT'])
def update_detail(detail_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_interface_detail(detail_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_interface_detail_api_bp.route('/api/hw-interface-details/<int:detail_id>', methods=['DELETE'])
def delete_detail(detail_id: int):
    try:
        delete_interface_detail(detail_id)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
