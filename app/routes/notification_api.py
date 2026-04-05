"""알림(Notification) REST API Blueprint."""

import logging
from datetime import datetime
from flask import Blueprint, jsonify, request, session
from app.models import db, SysNotification
from app.services.notification_service import purge_old_notifications
from sqlalchemy import and_

logger = logging.getLogger(__name__)
notification_api_bp = Blueprint('notification_api', __name__)


def _current_user_id():
    """세션에서 현재 사용자 ID를 가져온다."""
    for key in ('user_profile_id', 'profile_user_id', 'user_id'):
        raw = session.get(key)
        if raw is not None:
            try:
                return int(raw)
            except (TypeError, ValueError):
                continue
    # emp_no 로 org_user 조회 폴백
    emp = session.get('emp_no')
    if emp:
        from app.models import UserProfile
        try:
            prof = UserProfile.query.filter_by(emp_no=emp).first()
            if prof:
                return prof.id
        except Exception:
            pass
    return None


def _noti_table_ready():
    try:
        db.session.execute(db.text("SELECT 1 FROM sys_notification LIMIT 1"))
        return True
    except Exception:
        db.session.rollback()
        return False


# ── 알림 목록 ──────────────────────────────────────────────────

@notification_api_bp.route('/api/notifications', methods=['GET'])
def list_notifications():
    uid = _current_user_id()
    if not uid:
        return jsonify(success=False, message='로그인이 필요합니다.'), 401
    if not _noti_table_ready():
        return jsonify(success=True, rows=[], total=0, unread=0)

    # 60일 이전 알림 자동 삭제
    purge_old_notifications()

    now = datetime.now()
    category = request.args.get('category', '')  # ticket / task / calendar / '' (all)
    is_read_filter = request.args.get('is_read')  # 'true' / 'false' / None
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(100, max(1, int(request.args.get('per_page', 50))))

    q = SysNotification.query.filter(
        SysNotification.user_id == uid,
        SysNotification.trigger_at <= now,
    )
    if category:
        q = q.filter(SysNotification.ref_type == category)
    if is_read_filter == 'true':
        q = q.filter(SysNotification.is_read == True)
    elif is_read_filter == 'false':
        q = q.filter(SysNotification.is_read == False)

    total = q.count()
    rows = q.order_by(SysNotification.trigger_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    unread = SysNotification.query.filter(
        SysNotification.user_id == uid,
        SysNotification.trigger_at <= now,
        SysNotification.is_read == False,
    ).count()

    return jsonify(
        success=True,
        rows=[_serialize(r) for r in rows],
        total=total,
        unread=unread,
        page=page,
        per_page=per_page,
    )


# ── 읽지 않은 수 ──────────────────────────────────────────────

@notification_api_bp.route('/api/notifications/unread-count', methods=['GET'])
def unread_count():
    uid = _current_user_id()
    if not uid:
        return jsonify(success=False, message='로그인이 필요합니다.'), 401
    if not _noti_table_ready():
        return jsonify(success=True, count=0)

    now = datetime.now()
    q = SysNotification.query.filter(
        SysNotification.user_id == uid,
        SysNotification.trigger_at <= now,
        SysNotification.is_read == False,
    )
    category = request.args.get('category', '')
    if category:
        q = q.filter(SysNotification.ref_type == category)
    cnt = q.count()
    return jsonify(success=True, count=cnt)


# ── 단건 읽음 처리 ────────────────────────────────────────────

@notification_api_bp.route('/api/notifications/<int:noti_id>/read', methods=['PUT'])
def mark_read(noti_id):
    uid = _current_user_id()
    if not uid:
        return jsonify(success=False, message='로그인이 필요합니다.'), 401
    if not _noti_table_ready():
        return jsonify(success=False, message='테이블 없음'), 500

    row = SysNotification.query.filter_by(id=noti_id, user_id=uid).first()
    if not row:
        return jsonify(success=False, message='알림을 찾을 수 없습니다.'), 404
    row.is_read = True
    row.read_at = datetime.now()
    db.session.commit()
    return jsonify(success=True)


# ── 전체 읽음 처리 ────────────────────────────────────────────

@notification_api_bp.route('/api/notifications/read-all', methods=['POST'])
def mark_all_read():
    uid = _current_user_id()
    if not uid:
        return jsonify(success=False, message='로그인이 필요합니다.'), 401
    if not _noti_table_ready():
        return jsonify(success=True)

    now = datetime.now()
    SysNotification.query.filter(
        SysNotification.user_id == uid,
        SysNotification.trigger_at <= now,
        SysNotification.is_read == False,
    ).update({'is_read': True, 'read_at': now}, synchronize_session=False)
    db.session.commit()
    return jsonify(success=True)


# ── 전체 삭제 ─────────────────────────────────────────────────

@notification_api_bp.route('/api/notifications/delete-all', methods=['POST'])
def delete_all_notifications():
    uid = _current_user_id()
    if not uid:
        return jsonify(success=False, message='로그인이 필요합니다.'), 401
    if not _noti_table_ready():
        return jsonify(success=True)

    now = datetime.now()
    SysNotification.query.filter(
        SysNotification.user_id == uid,
        SysNotification.trigger_at <= now,
    ).delete(synchronize_session=False)
    db.session.commit()
    return jsonify(success=True)


# ── 직렬화 ────────────────────────────────────────────────────

def _serialize(n):
    return {
        'id': n.id,
        'noti_type': n.noti_type,
        'ref_type': n.ref_type,
        'ref_id': n.ref_id,
        'title': n.title,
        'message': n.message,
        'link': n.link,
        'is_read': bool(n.is_read),
        'read_at': n.read_at.isoformat() if n.read_at else None,
        'trigger_at': n.trigger_at.isoformat() if n.trigger_at else None,
        'created_at': n.created_at.isoformat() if n.created_at else None,
    }
