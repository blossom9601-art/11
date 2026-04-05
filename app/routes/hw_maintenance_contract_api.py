from flask import Blueprint, jsonify, request

from app.services.hw_maintenance_contract_service import (
    create_hw_maintenance_contract,
    delete_hw_maintenance_contract,
    init_hw_maintenance_contract_table,
    list_hw_maintenance_contracts,
    update_hw_maintenance_contract,
)

hw_maintenance_contract_api_bp = Blueprint('hw_maintenance_contract_api', __name__)


@hw_maintenance_contract_api_bp.before_app_request
def _ensure_table() -> None:
    # CREATE TABLE IF NOT EXISTS is idempotent.
    try:
        init_hw_maintenance_contract_table()
    except Exception:
        pass


@hw_maintenance_contract_api_bp.route('/api/hw-maintenance-contracts', methods=['GET'])
def list_contracts():
    try:
        scope_key = (request.args.get('scope_key') or '').strip()
        asset_id = request.args.get('asset_id')
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 500
        data = list_hw_maintenance_contracts(scope_key, int(asset_id), page=int(page), page_size=int(page_size))
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_maintenance_contract_api_bp.route('/api/hw-maintenance-contracts', methods=['POST'])
def create_contract():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_hw_maintenance_contract(payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_maintenance_contract_api_bp.route('/api/hw-maintenance-contracts/<int:contract_id>', methods=['PUT'])
def update_contract(contract_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_hw_maintenance_contract(contract_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_maintenance_contract_api_bp.route('/api/hw-maintenance-contracts/<int:contract_id>', methods=['DELETE'])
def delete_contract(contract_id: int):
    try:
        delete_hw_maintenance_contract(contract_id)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
