from flask import Blueprint, jsonify, request

from app.services.tab32_assign_group_service import (
    create_tab32_assign_group,
    create_tab32_group_host,
    create_tab32_group_replication,
    create_tab32_group_volume,
    delete_tab32_assign_group,
    delete_tab32_group_host,
    delete_tab32_group_replication,
    delete_tab32_group_volume,
    get_tab32_assign_group,
    init_tab32_assign_group_tables,
    list_tab32_assign_groups,
    list_tab32_group_hosts,
    list_tab32_group_replications,
    list_tab32_group_volumes,
    suggest_tab32_host_work_systems,
    update_tab32_assign_group,
    update_tab32_group_host,
    update_tab32_group_replication,
    update_tab32_group_volume,
        list_replication_storage_volume_names,
)

tab32_assign_group_api_bp = Blueprint('tab32_assign_group_api', __name__)


@tab32_assign_group_api_bp.before_app_request
def _ensure_tables() -> None:
    try:
        init_tab32_assign_group_tables()
    except Exception:
        pass


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups', methods=['GET'])
def list_groups():
    try:
        scope_key = (request.args.get('scope_key') or '').strip()
        asset_id = request.args.get('asset_id')
        page = request.args.get('page') or 1
        page_size = request.args.get('page_size') or 200
        data = list_tab32_assign_groups(scope_key, int(asset_id), page=int(page), page_size=int(page_size))
        return jsonify(data)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/host-assets', methods=['GET'])
def suggest_host_assets():
    try:
        q = (request.args.get('q') or '').strip()
        limit = request.args.get('limit') or 30
        raw_types = (request.args.get('asset_types') or '').strip()
        types: list[str] = []
        if raw_types:
            types.extend([t.strip() for t in raw_types.split(',') if t.strip()])
        try:
            # Also support repeated query params: ?asset_type=A&asset_type=B
            types.extend([t.strip() for t in (request.args.getlist('asset_type') or []) if t and t.strip()])
        except Exception:
            pass
        items = suggest_tab32_host_work_systems(q, limit=int(limit), asset_types=types or None)
        return jsonify({'items': items})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups', methods=['POST'])
def create_group():
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_tab32_assign_group(payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>', methods=['GET'])
def get_group(group_id: int):
    try:
        row = get_tab32_assign_group(group_id)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>', methods=['PUT'])
def update_group(group_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_tab32_assign_group(group_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>', methods=['DELETE'])
def delete_group(group_id: int):
    try:
        delete_tab32_assign_group(group_id)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


# Hosts
@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>/hosts', methods=['GET'])
def list_hosts(group_id: int):
    try:
        return jsonify({'items': list_tab32_group_hosts(group_id)})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>/hosts', methods=['POST'])
def create_host(group_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_tab32_group_host(group_id, payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/hosts/<int:host_id>', methods=['PUT'])
def update_host(host_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_tab32_group_host(host_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/hosts/<int:host_id>', methods=['DELETE'])
def delete_host(host_id: int):
    try:
        delete_tab32_group_host(host_id)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


# Volumes
@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>/volumes', methods=['GET'])
def list_volumes(group_id: int):
    try:
        return jsonify({'items': list_tab32_group_volumes(group_id)})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>/volumes', methods=['POST'])
def create_volume(group_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_tab32_group_volume(group_id, payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/volumes/<int:volume_id>', methods=['PUT'])
def update_volume(volume_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_tab32_group_volume(volume_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/volumes/<int:volume_id>', methods=['DELETE'])
def delete_volume(volume_id: int):
    try:
        delete_tab32_group_volume(volume_id)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


# Replications
@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>/replications', methods=['GET'])
def list_replications(group_id: int):
    try:
        return jsonify({'items': list_tab32_group_replications(group_id)})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400

@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>/replication-storage-volumes', methods=['GET'])
def list_replication_storage_volumes(group_id: int):
    """Return volume_name list for the selected replication storage work_name."""
    try:
        work_name = (request.args.get('work_name') or '').strip()
        items = list_replication_storage_volume_names(group_id, work_name)
        return jsonify({'items': items})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/<int:group_id>/replications', methods=['POST'])
def create_replication(group_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = create_tab32_group_replication(group_id, payload, actor=actor)
        return jsonify(row), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/replications/<int:replication_id>', methods=['PUT'])
def update_replication(replication_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        actor = (request.headers.get('X-Actor') or '').strip() or 'system'
        row = update_tab32_group_replication(replication_id, payload, actor=actor)
        return jsonify(row)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@tab32_assign_group_api_bp.route('/api/tab32-assign-groups/replications/<int:replication_id>', methods=['DELETE'])
def delete_replication(replication_id: int):
    try:
        delete_tab32_group_replication(replication_id)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
