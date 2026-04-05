"""
change_event_service.py
──────────────────────────────────────────
변경이력(ChangeEvent / ChangeDiff) 서비스 레이어.

tab01~tab99 페이지에서 발생한 변경사항을 중앙 DB 에 기록하고,
tab14-log 페이지에서 조회/필터링할 수 있도록 한다.

section_key = normalize(title|subtitle)  기준으로 그룹핑한다.
"""

import re
import json
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from flask import current_app
from sqlalchemy import or_

from app.models import db, ChangeEvent, ChangeDiff

# ──────────────────────────────────────────
# 유틸리티
# ──────────────────────────────────────────

# 민감정보 필드 패턴 — diff 저장 시 마스킹
_SENSITIVE_PATTERNS = re.compile(
    r'password|passwd|secret|token|api.?key|private.?key|주민.?번호|resident.?id',
    re.IGNORECASE,
)


def normalize_section_key(title: Optional[str], subtitle: Optional[str]) -> str:
    """title|subtitle 조합을 정규화한 section_key 를 반환한다.

    - 앞뒤 공백/연속 공백 제거
    - 소문자 변환
    - NFC 유니코드 정규화
    - 특수문자(|) 외 제거하지 않음(가독성 유지)
    """
    t = (title or '').strip()
    s = (subtitle or '').strip()
    raw = f"{t}|{s}"
    raw = unicodedata.normalize('NFC', raw)
    raw = re.sub(r'\s+', ' ', raw).strip()
    return raw.lower()


def _mask_value(value: Any) -> str:
    """민감 값 마스킹"""
    s = str(value) if value is not None else ''
    if len(s) <= 4:
        return '****'
    return s[:2] + '*' * (len(s) - 4) + s[-2:]


def _is_sensitive_field(field_name: str) -> bool:
    return bool(_SENSITIVE_PATTERNS.search(field_name or ''))


# ──────────────────────────────────────────
# 테이블 초기화 (SQLAlchemy create_all)
# ──────────────────────────────────────────

def init_change_event_tables(app=None):
    """change_event / change_diff 테이블을 생성한다."""
    app = app or current_app
    with app.app_context():
        engine = db.get_engine()
        ChangeEvent.__table__.create(engine, checkfirst=True)
        ChangeDiff.__table__.create(engine, checkfirst=True)


# ──────────────────────────────────────────
# diff 생성 헬퍼
# ──────────────────────────────────────────

def compute_diffs(
    old_data: Dict[str, Any],
    new_data: Dict[str, Any],
    *,
    fields: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """old_data 와 new_data 를 비교하여 diff 목록을 반환한다.

    Returns:
        [{'field': str, 'old_value': str, 'new_value': str,
          'value_type': str, 'is_sensitive': bool}, ...]
    """
    if fields is None:
        fields = sorted(set(list(old_data.keys()) + list(new_data.keys())))

    result = []
    for f in fields:
        ov = old_data.get(f)
        nv = new_data.get(f)
        # 정규화 비교
        ov_str = '' if ov is None else str(ov).strip()
        nv_str = '' if nv is None else str(nv).strip()
        if ov_str == nv_str:
            continue

        sensitive = _is_sensitive_field(f)
        vtype = 'string'
        if isinstance(nv, bool) or isinstance(ov, bool):
            vtype = 'boolean'
        elif isinstance(nv, (int, float)) or isinstance(ov, (int, float)):
            vtype = 'number'
        elif isinstance(nv, dict) or isinstance(ov, dict) or isinstance(nv, list) or isinstance(ov, list):
            vtype = 'json'
            ov_str = json.dumps(ov, ensure_ascii=False, default=str) if ov is not None else ''
            nv_str = json.dumps(nv, ensure_ascii=False, default=str) if nv is not None else ''

        result.append({
            'field': f,
            'old_value': _mask_value(ov_str) if sensitive else ov_str,
            'new_value': _mask_value(nv_str) if sensitive else nv_str,
            'value_type': vtype,
            'is_sensitive': sensitive,
        })
    return result


def build_summary(diffs: List[Dict[str, Any]], *, max_len: int = 450) -> str:
    """diff 목록에서 요약 문자열을 생성한다. 예: "CPU: 8→16, RAM: 32→64" """
    parts = []
    for d in diffs:
        ov = d.get('old_value', '') or ''
        nv = d.get('new_value', '') or ''
        # 긴 값은 축약
        if len(ov) > 30:
            ov = ov[:27] + '...'
        if len(nv) > 30:
            nv = nv[:27] + '...'
        parts.append(f"{d['field']}: {ov}→{nv}")
    text = ', '.join(parts)
    if len(text) > max_len:
        text = text[:max_len - 3] + '...'
    return text


# ──────────────────────────────────────────
# 변경이력 기록 (핵심)
# ──────────────────────────────────────────

def record_change_event(
    *,
    action_type: str = 'UPDATE',
    page_key: Optional[str] = None,
    title: Optional[str] = None,
    subtitle: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    actor_ip: Optional[str] = None,
    request_id: Optional[str] = None,
    summary: Optional[str] = None,
    diffs: Optional[List[Dict[str, Any]]] = None,
    extra_json: Optional[str] = None,
) -> Optional[ChangeEvent]:
    """변경 이벤트를 DB 에 기록한다.

    - 동일 request_id 가 이미 존재하면 중복 기록하지 않는다 (idempotency).
    - diffs 가 비어 있으면 이벤트만 헤더로 기록한다.
    """
    # 중복 방지
    if request_id:
        existing = ChangeEvent.query.filter_by(request_id=request_id).first()
        if existing:
            return existing

    section_key = normalize_section_key(title, subtitle)

    # summary 자동 생성
    if not summary and diffs:
        summary = build_summary(diffs)

    _KST = timezone(timedelta(hours=9))
    event = ChangeEvent(
        occurred_at=datetime.now(_KST).replace(tzinfo=None),
        actor_id=str(actor_id) if actor_id else None,
        actor_name=actor_name,
        actor_ip=actor_ip,
        action_type=action_type.upper() if action_type else 'UPDATE',
        page_key=page_key,
        section_key=section_key,
        title=title,
        subtitle=subtitle,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        request_id=request_id,
        summary=summary,
        extra_json=extra_json,
    )
    db.session.add(event)
    db.session.flush()  # id 확보

    if diffs:
        for d in diffs:
            diff_row = ChangeDiff(
                event_id=event.id,
                field=d['field'],
                old_value=d.get('old_value', ''),
                new_value=d.get('new_value', ''),
                value_type=d.get('value_type', 'string'),
                is_sensitive=bool(d.get('is_sensitive', False)),
            )
            db.session.add(diff_row)

    db.session.commit()
    return event


# ──────────────────────────────────────────
# 변경이력 조회 (tab14-log 페이지용)
# ──────────────────────────────────────────

def _event_to_dict(ev: ChangeEvent, *, include_diffs: bool = False) -> Dict[str, Any]:
    d = {
        'id': ev.id,
        'occurred_at': ev.occurred_at.strftime('%Y-%m-%d %H:%M') if ev.occurred_at else '',
        'actor_id': ev.actor_id or '',
        'actor_name': ev.actor_name or '',
        'actor_ip': ev.actor_ip or '',
        'action_type': ev.action_type or '',
        'page_key': ev.page_key or '',
        'section_key': ev.section_key or '',
        'title': ev.title or '',
        'subtitle': ev.subtitle or '',
        'entity_type': ev.entity_type or '',
        'entity_id': ev.entity_id or '',
        'request_id': ev.request_id or '',
        'summary': ev.summary or '',
        'extra_json': ev.extra_json or '',
    }
    if include_diffs:
        d['diffs'] = [_diff_to_dict(df) for df in (ev.diffs or [])]
    else:
        d['diffs_count'] = len(ev.diffs) if ev.diffs else 0
    return d


def _diff_to_dict(df: ChangeDiff) -> Dict[str, Any]:
    return {
        'id': df.id,
        'field': df.field or '',
        'old_value': '****' if df.is_sensitive else (df.old_value or ''),
        'new_value': '****' if df.is_sensitive else (df.new_value or ''),
        'value_type': df.value_type or 'string',
        'is_sensitive': bool(df.is_sensitive),
    }


def list_change_events(
    *,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    page_key: Optional[str] = None,
    section_key: Optional[str] = None,
    title: Optional[str] = None,
    subtitle: Optional[str] = None,
    actor: Optional[str] = None,
    action_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = 1,
    size: int = 20,
    sort: str = 'occurred_at_desc',
) -> Dict[str, Any]:
    """변경이력 목록을 조회한다 (필터/페이징/정렬)."""
    q = ChangeEvent.query

    if entity_type:
        q = q.filter(ChangeEvent.entity_type == entity_type)
    if entity_id:
        q = q.filter(ChangeEvent.entity_id == entity_id)
    if page_key:
        q = q.filter(ChangeEvent.page_key == page_key)
    if section_key:
        q = q.filter(ChangeEvent.section_key == section_key)
    if title:
        q = q.filter(ChangeEvent.title == title)
    if subtitle:
        q = q.filter(ChangeEvent.subtitle == subtitle)
    if actor:
        q = q.filter(
            or_(
                ChangeEvent.actor_name.ilike(f'%{actor}%'),
                ChangeEvent.actor_id.ilike(f'%{actor}%'),
            )
        )
    if action_type:
        q = q.filter(ChangeEvent.action_type == action_type.upper())
    if date_from:
        try:
            dt = datetime.strptime(date_from, '%Y-%m-%d')
            q = q.filter(ChangeEvent.occurred_at >= dt)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.strptime(date_to, '%Y-%m-%d')
            # 하루 끝까지 포함
            dt = dt.replace(hour=23, minute=59, second=59)
            q = q.filter(ChangeEvent.occurred_at <= dt)
        except ValueError:
            pass
    if keyword:
        like = f'%{keyword}%'
        q = q.filter(
            or_(
                ChangeEvent.summary.ilike(like),
                ChangeEvent.title.ilike(like),
                ChangeEvent.subtitle.ilike(like),
                ChangeEvent.page_key.ilike(like),
            )
        )

    # 정렬
    if sort == 'occurred_at_asc':
        q = q.order_by(ChangeEvent.occurred_at.asc())
    else:
        q = q.order_by(ChangeEvent.occurred_at.desc())

    # 전체 건수
    total = q.count()

    # 페이징
    page = max(1, page)
    size = max(1, min(size, 200))
    offset = (page - 1) * size
    events = q.offset(offset).limit(size).all()

    return {
        'events': [_event_to_dict(ev) for ev in events],
        'page': page,
        'size': size,
        'total': total,
        'total_pages': max(1, -(-total // size)),  # ceil division
    }


def get_change_event_detail(event_id: int) -> Optional[Dict[str, Any]]:
    """변경이력 상세 조회 (diff 포함)."""
    ev = ChangeEvent.query.get(event_id)
    if not ev:
        return None
    return _event_to_dict(ev, include_diffs=True)


def delete_change_events(ids: List[int]) -> int:
    """변경이력 이벤트를 물리적으로 삭제한다. 반환: 삭제된 건수."""
    if not ids:
        return 0
    # diff 먼저 삭제
    ChangeDiff.query.filter(ChangeDiff.event_id.in_(ids)).delete(synchronize_session=False)
    count = ChangeEvent.query.filter(ChangeEvent.id.in_(ids)).delete(synchronize_session=False)
    db.session.commit()
    return count
