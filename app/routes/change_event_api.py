"""
change_event_api.py
──────────────────────────────────────────
변경이력(ChangeEvent) REST API Blueprint.

GET  /api/change-events          변경이력 목록 조회 (필터/페이징)
GET  /api/change-events/<id>     변경이력 상세 조회 (diff 포함)
POST /api/change-events          변경이력 수동 기록
"""

import logging
from flask import Blueprint, jsonify, request

from flask import session as flask_session
from app.services.change_event_service import (
    list_change_events,
    get_change_event_detail,
    record_change_event,
    compute_diffs,
    build_summary,
    delete_change_events,
)

logger = logging.getLogger(__name__)

change_event_api_bp = Blueprint('change_event_api', __name__)


@change_event_api_bp.route('/api/change-events', methods=['GET'])
def api_list_change_events():
    """변경이력 목록 조회.

    Query params:
        date_from, date_to, entity_type, entity_id, page_key,
        title, subtitle, section_key, actor, action_type,
        keyword, page, size, sort
    """
    try:
        params = {
            'entity_type': (request.args.get('entity_type') or '').strip() or None,
            'entity_id': (request.args.get('entity_id') or '').strip() or None,
            'page_key': (request.args.get('page_key') or '').strip() or None,
            'section_key': (request.args.get('section_key') or '').strip() or None,
            'title': (request.args.get('title') or '').strip() or None,
            'subtitle': (request.args.get('subtitle') or '').strip() or None,
            'actor': (request.args.get('actor') or '').strip() or None,
            'action_type': (request.args.get('action_type') or '').strip() or None,
            'date_from': (request.args.get('date_from') or '').strip() or None,
            'date_to': (request.args.get('date_to') or '').strip() or None,
            'keyword': (request.args.get('keyword') or '').strip() or None,
            'page': int(request.args.get('page') or 1),
            'size': int(request.args.get('size') or 20),
            'sort': (request.args.get('sort') or 'occurred_at_desc').strip(),
        }
        data = list_change_events(**params)
        return jsonify({'success': True, **data})
    except Exception as exc:
        logger.exception('Failed to list change events')
        return jsonify({'success': False, 'error': str(exc)}), 400


@change_event_api_bp.route('/api/change-events/<int:event_id>', methods=['GET'])
def api_get_change_event(event_id: int):
    """변경이력 상세 조회 (diff 포함)."""
    try:
        data = get_change_event_detail(event_id)
        if data is None:
            return jsonify({'success': False, 'error': '변경이력을 찾을 수 없습니다.'}), 404
        return jsonify({'success': True, 'event': data})
    except Exception as exc:
        logger.exception('Failed to get change event %s', event_id)
        return jsonify({'success': False, 'error': str(exc)}), 400


@change_event_api_bp.route('/api/change-events', methods=['POST'])
def api_create_change_event():
    """변경이력 수동 기록 (선택적 diff 포함).

    Body JSON:
        action_type, page_key, title, subtitle,
        entity_type, entity_id, actor_id, actor_name,
        request_id, summary, diffs (optional), extra_json
    """
    try:
        body = request.get_json(silent=True) or {}

        # 클라이언트 IP 자동 기록
        actor_ip = request.remote_addr

        event = record_change_event(
            action_type=body.get('action_type', 'UPDATE'),
            page_key=body.get('page_key'),
            title=body.get('title'),
            subtitle=body.get('subtitle'),
            entity_type=body.get('entity_type'),
            entity_id=body.get('entity_id'),
            actor_id=body.get('actor_id'),
            actor_name=body.get('actor_name'),
            actor_ip=actor_ip,
            request_id=body.get('request_id'),
            summary=body.get('summary'),
            diffs=body.get('diffs'),
            extra_json=body.get('extra_json'),
        )
        if event:
            return jsonify({'success': True, 'id': event.id}), 201
        return jsonify({'success': True, 'message': 'duplicate request_id'}), 200
    except Exception as exc:
        logger.exception('Failed to create change event')
        return jsonify({'success': False, 'error': str(exc)}), 400


@change_event_api_bp.route('/api/change-events/bulk-delete', methods=['POST'])
def api_bulk_delete_change_events():
    """변경이력 일괄 삭제 (ADMIN 전용)."""
    try:
        role = (flask_session.get('role') or '').strip().upper()
        if role not in ('ADMIN', '관리자'):
            return jsonify({'success': False, 'error': '관리자만 삭제할 수 있습니다.'}), 403

        body = request.get_json(silent=True) or {}
        ids = body.get('ids')
        if not ids or not isinstance(ids, list):
            return jsonify({'success': False, 'error': '삭제할 항목을 선택해주세요.'}), 400

        int_ids = [int(i) for i in ids if str(i).isdigit()]
        if not int_ids:
            return jsonify({'success': False, 'error': '유효한 ID가 없습니다.'}), 400

        count = delete_change_events(int_ids)
        return jsonify({'success': True, 'deleted': count})
    except Exception as exc:
        logger.exception('Failed to bulk-delete change events')
        return jsonify({'success': False, 'error': str(exc)}), 400
