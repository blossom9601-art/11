from flask import Blueprint, jsonify, request

from app.services.hw_firewalld_service import (
    create_hw_firewalld,
    delete_hw_firewalld,
    get_hw_firewalld,
    init_hw_firewalld_table,
    list_hw_firewallds,
    update_hw_firewalld,
)

hw_firewalld_api_bp = Blueprint('hw_firewalld_api', __name__)


@hw_firewalld_api_bp.before_app_request
def _ensure_table() -> None:
    try:
        init_hw_firewalld_table()
    except Exception:
        pass


@hw_firewalld_api_bp.route('/api/hw-firewallds', methods=['GET'])
def list_firewallds():
    try:
        scope_key = (request.args.get('scope_key') or '').strip()
        asset_id = request.args.get('asset_id')
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 500
        data = list_hw_firewallds(scope_key, int(asset_id), page=int(page), page_size=int(page_size))
        # Debug marker (safe to keep; helps verify hot reload / correct blueprint)
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_firewalld_api_bp.route('/api/hw-firewallds', methods=['POST'])
def create_firewalld():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_hw_firewalld(payload, actor=actor)
        from app.routes.api import _try_record_change
        # name → policy_name 매핑 (방화벽의 name은 정책명)
        _data = dict(row)
        if 'name' in _data:
            _data['policy_name'] = _data.pop('name')
        _try_record_change(
            action_type='CREATE',
            entity_type='hardware_asset',
            entity_id=payload.get('asset_id'),
            tab_name='방화벽',
            new_data=_data,
            summary='방화벽 추가: ' + (row.get('name') or ''),
        )
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_firewalld_api_bp.route('/api/hw-firewallds/<int:firewalld_id>', methods=['PUT'])
def update_firewalld(firewalld_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        old_raw = get_hw_firewalld(firewalld_id)
        row = update_hw_firewalld(firewalld_id, payload, actor=actor)
        from app.routes.api import _try_record_change
        # name → policy_name 매핑
        def _remap(d):
            if not d:
                return d
            c = dict(d)
            if 'name' in c:
                c['policy_name'] = c.pop('name')
            return c
        _try_record_change(
            action_type='UPDATE',
            entity_type='hardware_asset',
            entity_id=row.get('asset_id'),
            tab_name='방화벽',
            old_data=_remap(old_raw),
            new_data=_remap(row),
        )
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@hw_firewalld_api_bp.route('/api/hw-firewallds/<int:firewalld_id>', methods=['DELETE'])
def delete_firewalld(firewalld_id: int):
    try:
        old_raw = get_hw_firewalld(firewalld_id)
        asset_id = old_raw.get('asset_id') if old_raw else None
        label = (old_raw.get('name') or '') if old_raw else ''
        delete_hw_firewalld(firewalld_id)
        from app.routes.api import _try_record_change
        # name → policy_name 매핑
        if old_raw and 'name' in old_raw:
            old_raw = dict(old_raw)
            old_raw['policy_name'] = old_raw.pop('name')
        _try_record_change(
            action_type='DELETE',
            entity_type='hardware_asset',
            entity_id=asset_id,
            tab_name='방화벽',
            old_data=old_raw,
            summary='방화벽 삭제: ' + label,
        )
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
