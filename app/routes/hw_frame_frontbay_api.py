from flask import Blueprint, jsonify, request

from app.services.hw_frame_frontbay_service import (
    create_hw_frame_frontbay_item,
    delete_hw_frame_frontbay_item,
    init_hw_frame_frontbay_table,
    list_hw_frame_frontbay_items,
    update_hw_frame_frontbay_item,
)

hw_frame_frontbay_api_bp = Blueprint('hw_frame_frontbay_api', __name__)


@hw_frame_frontbay_api_bp.before_app_request
def _ensure_table() -> None:
    try:
        init_hw_frame_frontbay_table()
    except Exception:
        pass


@hw_frame_frontbay_api_bp.route('/api/hw-frame-frontbay', methods=['GET'])
def list_frontbay_items():
    try:
        scope_key = (request.args.get('scope_key') or '').strip()
        asset_id = request.args.get('asset_id')
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 500
        data = list_hw_frame_frontbay_items(scope_key, int(asset_id), page=int(page), page_size=int(page_size))
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_frame_frontbay_api_bp.route('/api/hw-frame-frontbay', methods=['POST'])
def create_frontbay_item():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_hw_frame_frontbay_item(payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_frame_frontbay_api_bp.route('/api/hw-frame-frontbay/<int:item_id>', methods=['PUT'])
def update_frontbay_item(item_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_hw_frame_frontbay_item(item_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_frame_frontbay_api_bp.route('/api/hw-frame-frontbay/<int:item_id>', methods=['DELETE'])
def delete_frontbay_item(item_id: int):
    try:
        delete_hw_frame_frontbay_item(item_id)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
