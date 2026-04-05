from flask import Blueprint, jsonify, request

from app.services.tab14_change_log_service import (
    create_change_log,
    delete_change_log,
    init_tab14_change_log_table,
    list_change_logs,
    update_change_log,
)

change_log_api_bp = Blueprint('tab14_change_log_api', __name__)


@change_log_api_bp.before_app_request
def _ensure_table() -> None:
    try:
        init_tab14_change_log_table()
    except Exception:
        pass


@change_log_api_bp.route('/api/change-logs', methods=['GET'])
def list_tab14_change_logs():
    try:
        entity_key = (request.args.get('entity_key') or '').strip()
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 500
        data = list_change_logs(entity_key, page=int(page), page_size=int(page_size))
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@change_log_api_bp.route('/api/change-logs', methods=['POST'])
def create_tab14_change_log():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_change_log(payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@change_log_api_bp.route('/api/change-logs/<int:log_id>', methods=['PUT'])
def update_tab14_change_log(log_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_change_log(log_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@change_log_api_bp.route('/api/change-logs/<int:log_id>', methods=['DELETE'])
def delete_tab14_change_log(log_id: int):
    try:
        delete_change_log(log_id)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
