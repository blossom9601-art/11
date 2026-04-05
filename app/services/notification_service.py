"""알림(Notification) 서비스 — 테이블 초기화 + 생성 헬퍼."""

import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


RETENTION_DAYS = 60


def init_notification_table(app):
    """sys_notification 테이블이 없으면 생성."""
    from app.models import db, SysNotification
    with app.app_context():
        engine = db.get_engine()
        SysNotification.__table__.create(engine, checkfirst=True)


def purge_old_notifications():
    """RETENTION_DAYS 이전 알림을 DB에서 삭제."""
    from app.models import db, SysNotification
    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    try:
        deleted = SysNotification.query.filter(
            SysNotification.created_at < cutoff,
        ).delete(synchronize_session=False)
        if deleted:
            db.session.commit()
            logger.info('purge_old_notifications: %d rows deleted', deleted)
    except Exception:
        db.session.rollback()
        logger.exception('purge_old_notifications failed')


# ─── 알림 생성 헬퍼 ───────────────────────────────────────────

def _now_dt() -> datetime:
    """DB에 저장된 시각이 KST(로컬)이므로 로컬 시각 사용."""
    return datetime.now()


def create_notification(
    user_id: int,
    noti_type: str,
    ref_type: str,
    ref_id: int,
    title: str,
    message: str = '',
    link: str = '',
    trigger_at: Optional[datetime] = None,
):
    """단건 알림 레코드를 DB에 INSERT (flush만, commit은 호출자 책임)."""
    from app.models import db, SysNotification
    n = SysNotification(
        user_id=user_id,
        noti_type=noti_type,
        ref_type=ref_type,
        ref_id=ref_id,
        title=title,
        message=message or '',
        link=link or '',
        trigger_at=trigger_at or _now_dt(),
        created_at=_now_dt(),
    )
    db.session.add(n)


# ─── 티켓 상태 변경 알림 ──────────────────────────────────────

_TICKET_STATUS_LABEL = {
    'PENDING': '대기',
    'IN_PROGRESS': '진행중',
    'DONE': '완료',
    'CLOSED': '종료',
    'REJECTED': '반려',
    'CANCELLED': '취소',
}


def notify_ticket_status_change(ticket, old_status: str, new_status: str, actor_user_id: int):
    """티켓 상태 변경 시 신청자/접수자에게 알림 생성."""
    if old_status == new_status:
        return
    from app.models import UserProfile
    old_label = _TICKET_STATUS_LABEL.get(old_status, old_status or '없음')
    new_label = _TICKET_STATUS_LABEL.get(new_status, new_status or '없음')
    title = f'[티켓] {ticket.title}'
    message = f'상태가 "{old_label}" → "{new_label}"(으)로 변경되었습니다.'
    link = f'/addon/notifications'

    recipients = set()
    if ticket.requester_user_id:
        recipients.add(ticket.requester_user_id)
    if ticket.assignee_user_id:
        recipients.add(ticket.assignee_user_id)
    # 다중 담당자
    if ticket.assignee_json:
        import json as _json
        try:
            arr = _json.loads(ticket.assignee_json) if isinstance(ticket.assignee_json, str) else ticket.assignee_json
            if isinstance(arr, list):
                for a in arr:
                    uid = a.get('user_id') or a.get('id') if isinstance(a, dict) else None
                    if uid:
                        try:
                            recipients.add(int(uid))
                        except (TypeError, ValueError):
                            pass
        except Exception:
            pass

    for uid in recipients:
        create_notification(
            user_id=uid,
            noti_type='ticket_status',
            ref_type='ticket',
            ref_id=ticket.id,
            title=title,
            message=message,
            link=link,
        )


# ─── 작업 상태 변경 알림 ──────────────────────────────────────

_TASK_STATUS_LABEL = {
    'pending': '대기',
    'in_progress': '진행중',
    'completed': '완료',
    'cancelled': '취소',
    '대기': '대기',
    '진행': '진행',
    '완료': '완료',
    '취소': '취소',
}


def notify_task_status_change(task_row, old_status: str, new_status: str, actor_user_id: int):
    """작업이력 상태 변경 시 관련자에게 알림 생성."""
    if old_status == new_status:
        return
    old_label = _TASK_STATUS_LABEL.get(old_status, old_status or '없음')
    new_label = _TASK_STATUS_LABEL.get(new_status, new_status or '없음')
    task_name = getattr(task_row, 'name', '') or '작업'
    title = f'[작업] {task_name}'
    message = f'상태가 "{old_label}" → "{new_label}"(으)로 변경되었습니다.'
    link = f'/addon/notifications'

    recipients = set()
    if getattr(task_row, 'created_by_user_id', None):
        recipients.add(task_row.created_by_user_id)
    if getattr(task_row, 'updated_by_user_id', None):
        recipients.add(task_row.updated_by_user_id)

    for uid in recipients:
        create_notification(
            user_id=uid,
            noti_type='task_status',
            ref_type='task',
            ref_id=task_row.id,
            title=title,
            message=message,
            link=link,
        )


# ─── 캘린더 리마인더 생성 ─────────────────────────────────────

def generate_calendar_reminders(schedule):
    """일정 생성/수정 시 24h 전, 1h 전 알림을 예약 생성.
    시작 시각이 이미 임박하거나 지난 경우에도 즉시 알림을 생성한다.
    기존 동일 ref의 미열람 리마인더는 삭제 후 재생성."""
    from app.models import db, SysNotification
    start = schedule.start_datetime
    if not start:
        return

    now = _now_dt()

    # 기존 리마인더 삭제 (아직 읽지 않은 것만)
    SysNotification.query.filter_by(
        ref_type='calendar',
        ref_id=schedule.id,
        is_read=False,
    ).filter(SysNotification.noti_type.in_(['calendar_24h', 'calendar_1h'])).delete(synchronize_session=False)

    # 대상 사용자: 소유자 + 공유 사용자
    recipients = set()
    if schedule.owner_user_id:
        recipients.add(schedule.owner_user_id)
    if hasattr(schedule, 'share_users') and schedule.share_users:
        for su in schedule.share_users:
            if su.notification_enabled and su.user_id:
                recipients.add(su.user_id)

    title = f'[일정] {schedule.title}'
    link = f'/addon/notifications'

    for uid in recipients:
        created_any = False
        # 24시간 전
        t24 = start - timedelta(hours=24)
        if t24 > now:
            create_notification(
                user_id=uid,
                noti_type='calendar_24h',
                ref_type='calendar',
                ref_id=schedule.id,
                title=title,
                message='일정 시작 24시간 전입니다.',
                link=link,
                trigger_at=t24,
            )
            created_any = True
        # 1시간 전
        t1 = start - timedelta(hours=1)
        if t1 > now:
            create_notification(
                user_id=uid,
                noti_type='calendar_1h',
                ref_type='calendar',
                ref_id=schedule.id,
                title=title,
                message='일정 시작 1시간 전입니다.',
                link=link,
                trigger_at=t1,
            )
            created_any = True
        # 시작이 1시간 이내이거나 이미 지난 경우 → 즉시 알림 생성
        if not created_any:
            create_notification(
                user_id=uid,
                noti_type='calendar_1h',
                ref_type='calendar',
                ref_id=schedule.id,
                title=title,
                message='일정이 곧 시작됩니다.' if start > now else '일정이 등록되었습니다.',
                link=link,
                trigger_at=now,
            )
