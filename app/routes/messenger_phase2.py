"""Messenger Phase 2 routes — Event Bridge / Access Approval / Push / Search.

Single Blueprint that aggregates the new domains so the legacy `api.py`
(27K+ lines) is not bloated further. All endpoints live under `/api/...`.

Auth model
- 사용자 컨텍스트 액션 (push, access, search): session-based (emp_no in session).
- 관리자 CRUD (event sources/rules, access targets, approval lines):
  ROLE_ADMIN equivalent — for now we accept any logged-in user but record
  actor in audit log. Tighten with `@require_admin` once role wiring is final.
- Webhook 수신 `/api/events/in/<token>`: 토큰 + 옵션 HMAC + 옵션 IP 화이트리스트.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional

from flask import Blueprint, jsonify, request, session
from sqlalchemy import or_

from app.models import (
    AccApproval,
    AccApprovalLine,
    AccRequest,
    AccTarget,
    EvtLog,
    EvtRule,
    EvtSource,
    MsgChannel,
    MsgConversation,
    MsgConversationMember,
    MsgMessageV2,
    MsgNotification,
    PushDevice,
    PushLog,
    UserProfile,
    db,
)

try:
    from app.routes.sse_api import notify_chat_event as _notify_chat_event
except Exception:  # pragma: no cover - SSE module always present in app
    def _notify_chat_event(*_args, **_kwargs) -> None:
        return None

try:
    from app.services.push_dispatch_service import enqueue_push as _enqueue_push
except Exception:  # pragma: no cover
    def _enqueue_push(**_kwargs) -> int:  # type: ignore
        return 0


def _enqueue_push_safe(user_ids, title, body, data=None, notification_id=None) -> None:
    """푸시 큐 적재 — 실패해도 호출부 흐름을 끊지 않는다."""
    try:
        _enqueue_push(
            user_ids=user_ids,
            title=title,
            body=body,
            data=data or {},
            notification_id=notification_id,
        )
    except Exception as exc:
        try:
            logger.warning('[push enqueue] failed: %s', exc)
        except Exception:
            pass

logger = logging.getLogger(__name__)
messenger_phase2_bp = Blueprint('messenger_phase2', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ok(payload: Optional[dict] = None, **extra) -> Any:
    base = {'success': True}
    if payload:
        base.update(payload)
    base.update(extra)
    return jsonify(base)


def _err(message: str, status: int = 400, code: Optional[str] = None) -> Any:
    return jsonify({'success': False, 'error': message, 'code': code or ''}), status


def _viewer_user_id() -> Optional[int]:
    emp_no = session.get('emp_no')
    if not emp_no:
        return None
    prof = UserProfile.query.filter(UserProfile.emp_no.ilike(emp_no)).first()
    return prof.id if prof else None


def _require_user() -> Optional[tuple]:
    """Return user_id or short-circuit response."""
    uid = _viewer_user_id()
    if not uid:
        return None
    return uid


def _client_ip() -> str:
    fwd = request.headers.get('X-Forwarded-For', '')
    if fwd:
        return fwd.split(',')[0].strip()
    return request.remote_addr or ''


def _ip_in_allowlist(ip_str: str, allow_json: Optional[str]) -> bool:
    if not allow_json:
        return True
    try:
        cidrs = json.loads(allow_json)
    except Exception:
        return True
    if not cidrs:
        return True
    try:
        ip = ipaddress.ip_address(ip_str)
    except Exception:
        return False
    for c in cidrs:
        try:
            if ip in ipaddress.ip_network(c, strict=False):
                return True
        except Exception:
            continue
    return False


def _json_or_400() -> Any:
    payload = request.get_json(silent=True)
    if payload is None:
        return None, _err('invalid json body', 400)
    return payload, None


def _json_dumps(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Event Bridge — Webhook receiver + Rule engine
# ---------------------------------------------------------------------------

def _payload_get(payload: dict, path: str) -> Any:
    """Resolve a dotted JSON path: 'rule.level' → payload['rule']['level']."""
    cur: Any = payload
    for key in (path or '').split('.'):
        if not key:
            continue
        if isinstance(cur, dict):
            cur = cur.get(key)
        elif isinstance(cur, list):
            try:
                cur = cur[int(key)]
            except Exception:
                return None
        else:
            return None
    return cur


def _match_rule(rule: EvtRule, payload: dict) -> bool:
    try:
        match_def = json.loads(rule.match_json or '[]')
    except Exception:
        return False
    if not isinstance(match_def, list):
        return False
    for cond in match_def:
        if not isinstance(cond, dict):
            return False
        path = cond.get('path') or ''
        op = (cond.get('op') or 'eq').lower()
        expected = cond.get('value')
        actual = _payload_get(payload, path)
        try:
            if op == 'eq':
                if actual != expected:
                    return False
            elif op in ('ne', '!='):
                if actual == expected:
                    return False
            elif op == 'contains':
                if expected is None or expected not in (actual or ''):
                    return False
            elif op == 'in':
                if not isinstance(expected, list) or actual not in expected:
                    return False
            elif op in ('gte', '>='):
                if actual is None or actual < expected:
                    return False
            elif op in ('lte', '<='):
                if actual is None or actual > expected:
                    return False
            elif op in ('gt', '>'):
                if actual is None or actual <= expected:
                    return False
            elif op in ('lt', '<'):
                if actual is None or actual >= expected:
                    return False
            elif op == 'exists':
                if (actual is None) == bool(expected):
                    return False
            else:
                return False
        except TypeError:
            return False
    return True


def _render_template(text: Optional[str], payload: dict) -> str:
    """Very small `{path}` placeholder substitution, no eval."""
    if not text:
        return ''
    out = text
    # Limit replacement attempts
    for _ in range(20):
        start = out.find('{')
        if start < 0:
            break
        end = out.find('}', start + 1)
        if end < 0:
            break
        key = out[start + 1:end]
        val = _payload_get(payload, key)
        out = out[:start] + ('' if val is None else str(val)) + out[end + 1:]
    return out


def _post_event_card(rule: EvtRule, payload: dict, severity: str) -> Optional[MsgMessageV2]:
    conversation_id = rule.target_conversation_id
    if not conversation_id and rule.target_channel_id:
        ch = MsgChannel.query.get(rule.target_channel_id)
        if ch:
            conversation_id = ch.conversation_id
    if not conversation_id:
        return None

    title = _render_template(rule.title_template or rule.name, payload)
    body = _render_template(rule.body_template or '', payload)

    actions = []
    try:
        if rule.action_buttons:
            actions = json.loads(rule.action_buttons) or []
    except Exception:
        actions = []

    metadata = {
        'kind': 'event_card',
        'severity': severity,
        'title': title,
        'body': body,
        'actions': actions,
        'sourceId': rule.source_id,
        'ruleId': rule.id,
        'occurredAt': payload.get('ts') or datetime.utcnow().isoformat() + 'Z',
        'context': payload,
    }

    # Use rule.created_by (or 0 fallback) as the synthetic sender — system bot.
    bot_user_id = rule.created_by or 0
    msg = MsgMessageV2(
        conversation_id=conversation_id,
        sender_id=bot_user_id if bot_user_id else _system_bot_user_id(),
        content=f'[{severity.upper()}] {title}',
        message_type='event_card',
        status='active',
        metadata_json=json.dumps(metadata, ensure_ascii=False),
    )
    db.session.add(msg)
    db.session.flush()

    conv = MsgConversation.query.get(conversation_id)
    if conv:
        conv.last_message_id = msg.id
        conv.last_message_preview = (msg.content or '')[:200]
        conv.last_message_at = msg.created_at
        conv.updated_at = datetime.utcnow()

    # Mention notifications
    try:
        mention_ids = json.loads(rule.mention_user_ids or '[]')
    except Exception:
        mention_ids = []
    for uid in mention_ids or []:
        try:
            uid = int(uid)
        except (TypeError, ValueError):
            continue
        notif = MsgNotification(
            user_id=uid,
            notification_type='event',
            reference_type='message',
            reference_id=msg.id,
            title=title or '시스템 이벤트',
            body=(body or '')[:255],
        )
        db.session.add(notif)
        db.session.flush()
        _enqueue_push_safe(
            [uid],
            notif.title,
            notif.body,
            data={'type': 'event_card', 'messageId': msg.id, 'conversationId': conversation_id},
            notification_id=notif.id,
        )

    # Bump unread for active members (excluding the synthetic sender)
    members = (
        MsgConversationMember.query
        .filter(MsgConversationMember.conversation_id == conversation_id)
        .filter(MsgConversationMember.left_at.is_(None))
        .all()
    )
    for m in members:
        if m.user_id == msg.sender_id:
            continue
        m.unread_count_cached = (m.unread_count_cached or 0) + 1
    return msg


def _system_bot_user_id() -> int:
    """Return a stable user_id to act as the system bot. Uses the smallest
    UserProfile id when no explicit bot exists. Falls back to 0 (which will
    fail FK on MySQL — that's intentional to surface misconfig in prod)."""
    prof = UserProfile.query.order_by(UserProfile.id.asc()).first()
    return prof.id if prof else 0


@messenger_phase2_bp.route('/api/events/in/<token>', methods=['POST'])
def event_webhook_in(token: str):
    src = EvtSource.query.filter(EvtSource.webhook_token == token).first()
    if not src or not src.is_active:
        return _err('unknown source', 404)

    if not _ip_in_allowlist(_client_ip(), src.ip_allowlist):
        return _err('ip not allowed', 403)

    raw_bytes = request.get_data() or b''
    if src.secret:
        sig = request.headers.get('X-Signature', '') or request.headers.get('X-Hub-Signature-256', '')
        if sig.startswith('sha256='):
            sig = sig.split('=', 1)[1]
        expected = hmac.new(src.secret.encode('utf-8'), raw_bytes, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig.lower(), expected.lower()):
            return _err('signature mismatch', 401)

    try:
        payload = json.loads(raw_bytes.decode('utf-8') or '{}')
    except Exception:
        return _err('invalid json', 400)

    log = EvtLog(
        source_id=src.id,
        raw_payload=raw_bytes.decode('utf-8', errors='replace')[:65536],
        normalized_payload=None,
        status='received',
    )
    db.session.add(log)
    db.session.flush()

    # Match rules in priority order
    rules = (
        EvtRule.query
        .filter(EvtRule.is_active.is_(True))
        .filter(or_(EvtRule.source_id == src.id, EvtRule.source_id.is_(None)))
        .order_by(EvtRule.priority.asc(), EvtRule.id.asc())
        .all()
    )
    matched: Optional[EvtRule] = None
    for r in rules:
        if _match_rule(r, payload):
            matched = r
            break

    if not matched:
        log.status = 'dropped'
        log.processed_at = datetime.utcnow()
        db.session.commit()
        return _ok({'matched': False}, eventLogId=log.id)

    log.rule_id = matched.id
    log.severity = matched.severity

    # Dedupe
    dedupe_key = _render_template(matched.dedupe_key_template, payload).strip()
    log.dedupe_key = dedupe_key or None
    if dedupe_key and matched.dedupe_window_sec > 0:
        cutoff = datetime.utcnow() - timedelta(seconds=int(matched.dedupe_window_sec))
        existing = (
            EvtLog.query
            .filter(EvtLog.dedupe_key == dedupe_key)
            .filter(EvtLog.received_at >= cutoff)
            .filter(EvtLog.id != log.id)
            .filter(EvtLog.status == 'processed')
            .order_by(EvtLog.id.desc())
            .first()
        )
        if existing:
            log.status = 'suppressed'
            log.message_id = existing.message_id
            log.processed_at = datetime.utcnow()
            db.session.commit()
            return _ok({'matched': True, 'suppressed': True}, eventLogId=log.id)

    try:
        msg = _post_event_card(matched, payload, matched.severity)
    except Exception as exc:
        logger.exception('event card post failed')
        log.status = 'failed'
        log.error_msg = str(exc)[:500]
        log.processed_at = datetime.utcnow()
        db.session.commit()
        return _err('failed to post message', 500)

    log.status = 'processed'
    log.message_id = msg.id if msg else None
    log.processed_at = datetime.utcnow()
    db.session.commit()
    if msg:
        _notify_chat_event('chat.event.card', msg.conversation_id, {
            'messageId': msg.id,
            'severity': matched.severity,
            'ruleId': matched.id,
        })
    return _ok({'matched': True, 'messageId': log.message_id}, eventLogId=log.id)


# ---- Admin CRUD: Event Sources --------------------------------------------

@messenger_phase2_bp.route('/api/admin/event-sources', methods=['GET'])
def list_event_sources():
    if not _require_user():
        return _err('unauthorized', 401)
    rows = EvtSource.query.order_by(EvtSource.id.desc()).all()
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))


@messenger_phase2_bp.route('/api/admin/event-sources', methods=['POST'])
def create_event_source():
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    name = (payload.get('name') or '').strip()
    if not name:
        return _err('name is required')
    src = EvtSource(
        name=name,
        kind=payload.get('kind') or 'custom',
        webhook_token=secrets.token_urlsafe(24),
        secret=payload.get('secret') or secrets.token_urlsafe(32),
        ip_allowlist=_json_dumps(payload.get('ipAllowlist')),
        is_active=bool(payload.get('isActive', True)),
        description=payload.get('description'),
        created_by=uid,
    )
    db.session.add(src)
    db.session.commit()
    return _ok(item=src.to_dict())


@messenger_phase2_bp.route('/api/admin/event-sources/<int:src_id>', methods=['PUT'])
def update_event_source(src_id: int):
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    src = EvtSource.query.get_or_404(src_id)
    payload, err = _json_or_400()
    if err:
        return err
    for field_in, attr in (('name', 'name'), ('kind', 'kind'), ('description', 'description')):
        if field_in in payload:
            setattr(src, attr, payload.get(field_in))
    if 'ipAllowlist' in payload:
        src.ip_allowlist = _json_dumps(payload.get('ipAllowlist'))
    if 'isActive' in payload:
        src.is_active = bool(payload.get('isActive'))
    if payload.get('rotateSecret'):
        src.secret = secrets.token_urlsafe(32)
    src.updated_at = datetime.utcnow()
    src.updated_by = uid
    db.session.commit()
    return _ok(item=src.to_dict())


@messenger_phase2_bp.route('/api/admin/event-sources/bulk-delete', methods=['POST'])
def delete_event_sources():
    if not _require_user():
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    ids = payload.get('ids') or []
    if not isinstance(ids, list) or not ids:
        return _err('ids required')
    EvtSource.query.filter(EvtSource.id.in_(ids)).update(
        {EvtSource.is_active: False, EvtSource.updated_at: datetime.utcnow()},
        synchronize_session=False,
    )
    db.session.commit()
    return _ok(deleted=len(ids))


# ---- Admin CRUD: Event Rules ----------------------------------------------

@messenger_phase2_bp.route('/api/admin/event-rules', methods=['GET'])
def list_event_rules():
    if not _require_user():
        return _err('unauthorized', 401)
    q = EvtRule.query
    src_id = request.args.get('sourceId', type=int)
    if src_id:
        q = q.filter(EvtRule.source_id == src_id)
    rows = q.order_by(EvtRule.priority.asc(), EvtRule.id.asc()).all()
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))


@messenger_phase2_bp.route('/api/admin/event-rules', methods=['POST'])
def create_event_rule():
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    name = (payload.get('name') or '').strip()
    if not name:
        return _err('name is required')
    severity = (payload.get('severity') or 'info').lower()
    if severity not in ('info', 'warning', 'error', 'critical'):
        return _err('severity must be info|warning|error|critical')
    rule = EvtRule(
        source_id=payload.get('sourceId'),
        name=name,
        priority=int(payload.get('priority') or 100),
        match_json=_json_dumps(payload.get('match') or payload.get('matchJson') or []),
        severity=severity,
        target_channel_id=payload.get('targetChannelId'),
        target_conversation_id=payload.get('targetConversationId'),
        mention_user_ids=_json_dumps(payload.get('mentionUserIds')),
        title_template=payload.get('titleTemplate'),
        body_template=payload.get('bodyTemplate'),
        action_buttons=_json_dumps(payload.get('actionButtons')),
        dedupe_key_template=payload.get('dedupeKeyTemplate'),
        dedupe_window_sec=int(payload.get('dedupeWindowSec') or 30),
        is_active=bool(payload.get('isActive', True)),
        created_by=uid,
    )
    db.session.add(rule)
    db.session.commit()
    return _ok(item=rule.to_dict())


@messenger_phase2_bp.route('/api/admin/event-rules/<int:rule_id>', methods=['PUT'])
def update_event_rule(rule_id: int):
    if not _require_user():
        return _err('unauthorized', 401)
    rule = EvtRule.query.get_or_404(rule_id)
    payload, err = _json_or_400()
    if err:
        return err
    if 'name' in payload:
        rule.name = (payload.get('name') or rule.name).strip()
    for f, attr in (
        ('sourceId', 'source_id'),
        ('priority', 'priority'),
        ('targetChannelId', 'target_channel_id'),
        ('targetConversationId', 'target_conversation_id'),
        ('titleTemplate', 'title_template'),
        ('bodyTemplate', 'body_template'),
        ('dedupeKeyTemplate', 'dedupe_key_template'),
        ('dedupeWindowSec', 'dedupe_window_sec'),
    ):
        if f in payload:
            setattr(rule, attr, payload.get(f))
    if 'severity' in payload:
        sev = (payload.get('severity') or 'info').lower()
        if sev not in ('info', 'warning', 'error', 'critical'):
            return _err('invalid severity')
        rule.severity = sev
    for f, attr in (
        ('match', 'match_json'), ('matchJson', 'match_json'),
        ('mentionUserIds', 'mention_user_ids'),
        ('actionButtons', 'action_buttons'),
    ):
        if f in payload:
            setattr(rule, attr, _json_dumps(payload.get(f)))
    if 'isActive' in payload:
        rule.is_active = bool(payload.get('isActive'))
    rule.updated_at = datetime.utcnow()
    db.session.commit()
    return _ok(item=rule.to_dict())


@messenger_phase2_bp.route('/api/admin/event-rules/bulk-delete', methods=['POST'])
def delete_event_rules():
    if not _require_user():
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    ids = payload.get('ids') or []
    if not isinstance(ids, list) or not ids:
        return _err('ids required')
    EvtRule.query.filter(EvtRule.id.in_(ids)).update(
        {EvtRule.is_active: False, EvtRule.updated_at: datetime.utcnow()},
        synchronize_session=False,
    )
    db.session.commit()
    return _ok(deleted=len(ids))


@messenger_phase2_bp.route('/api/admin/event-rules/<int:rule_id>/test', methods=['POST'])
def test_event_rule(rule_id: int):
    if not _require_user():
        return _err('unauthorized', 401)
    rule = EvtRule.query.get_or_404(rule_id)
    payload, err = _json_or_400()
    if err:
        return err
    sample = payload.get('payload') or payload
    matched = _match_rule(rule, sample if isinstance(sample, dict) else {})
    title = _render_template(rule.title_template or rule.name, sample if isinstance(sample, dict) else {})
    body = _render_template(rule.body_template or '', sample if isinstance(sample, dict) else {})
    return _ok(matched=matched, preview={'title': title, 'body': body, 'severity': rule.severity})


@messenger_phase2_bp.route('/api/admin/event-logs', methods=['GET'])
def list_event_logs():
    if not _require_user():
        return _err('unauthorized', 401)
    q = EvtLog.query
    if request.args.get('sourceId', type=int):
        q = q.filter(EvtLog.source_id == request.args.get('sourceId', type=int))
    if request.args.get('status'):
        q = q.filter(EvtLog.status == request.args.get('status'))
    rows = q.order_by(EvtLog.id.desc()).limit(200).all()
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))


# ---------------------------------------------------------------------------
# Access Approval — Targets / Lines / Requests / Approvals
# ---------------------------------------------------------------------------

# Approval Lines

@messenger_phase2_bp.route('/api/admin/approval-lines', methods=['GET'])
def list_approval_lines():
    if not _require_user():
        return _err('unauthorized', 401)
    rows = AccApprovalLine.query.order_by(AccApprovalLine.id.asc()).all()
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))


@messenger_phase2_bp.route('/api/admin/approval-lines', methods=['POST'])
def create_approval_line():
    if not _require_user():
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    name = (payload.get('name') or '').strip()
    if not name:
        return _err('name is required')
    steps = payload.get('steps') or payload.get('stepsJson') or []
    line = AccApprovalLine(
        name=name,
        steps_json=_json_dumps(steps) or '[]',
        is_default=bool(payload.get('isDefault')),
    )
    db.session.add(line)
    db.session.commit()
    return _ok(item=line.to_dict())


@messenger_phase2_bp.route('/api/admin/approval-lines/<int:line_id>', methods=['PUT'])
def update_approval_line(line_id: int):
    if not _require_user():
        return _err('unauthorized', 401)
    line = AccApprovalLine.query.get_or_404(line_id)
    payload, err = _json_or_400()
    if err:
        return err
    if 'name' in payload:
        line.name = (payload.get('name') or line.name).strip()
    if 'steps' in payload or 'stepsJson' in payload:
        line.steps_json = _json_dumps(payload.get('steps') or payload.get('stepsJson')) or '[]'
    if 'isDefault' in payload:
        line.is_default = bool(payload.get('isDefault'))
    line.updated_at = datetime.utcnow()
    db.session.commit()
    return _ok(item=line.to_dict())


@messenger_phase2_bp.route('/api/admin/approval-lines/bulk-delete', methods=['POST'])
def delete_approval_lines():
    if not _require_user():
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    ids = payload.get('ids') or []
    AccApprovalLine.query.filter(AccApprovalLine.id.in_(ids)).delete(synchronize_session=False)
    db.session.commit()
    return _ok(deleted=len(ids))


# Targets

@messenger_phase2_bp.route('/api/access/targets', methods=['GET'])
def list_access_targets():
    if not _require_user():
        return _err('unauthorized', 401)
    q = AccTarget.query.filter(AccTarget.is_active.is_(True))
    if request.args.get('kind'):
        q = q.filter(AccTarget.kind == request.args.get('kind'))
    if request.args.get('q'):
        kw = f"%{request.args.get('q')}%"
        q = q.filter(or_(AccTarget.name.ilike(kw), AccTarget.endpoint.ilike(kw)))
    rows = q.order_by(AccTarget.name.asc()).all()
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))


@messenger_phase2_bp.route('/api/admin/access-targets', methods=['POST'])
def create_access_target():
    if not _require_user():
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    name = (payload.get('name') or '').strip()
    kind = (payload.get('kind') or '').strip()
    if not name or not kind:
        return _err('name and kind are required')
    tgt = AccTarget(
        name=name,
        kind=kind,
        endpoint=payload.get('endpoint'),
        description=payload.get('description'),
        approval_line_id=payload.get('approvalLineId'),
        notify_channel_id=payload.get('notifyChannelId'),
        default_ttl_min=int(payload.get('defaultTtlMin') or 60),
        max_ttl_min=int(payload.get('maxTtlMin') or 480),
        allowed_hours_json=_json_dumps(payload.get('allowedHours')),
        ip_allowlist=_json_dumps(payload.get('ipAllowlist')),
        revoke_webhook_url=payload.get('revokeWebhookUrl'),
        is_active=bool(payload.get('isActive', True)),
    )
    db.session.add(tgt)
    db.session.commit()
    return _ok(item=tgt.to_dict())


@messenger_phase2_bp.route('/api/admin/access-targets/<int:tid>', methods=['PUT'])
def update_access_target(tid: int):
    if not _require_user():
        return _err('unauthorized', 401)
    tgt = AccTarget.query.get_or_404(tid)
    payload, err = _json_or_400()
    if err:
        return err
    for f, attr in (
        ('name', 'name'), ('kind', 'kind'), ('endpoint', 'endpoint'),
        ('description', 'description'), ('approvalLineId', 'approval_line_id'),
        ('notifyChannelId', 'notify_channel_id'),
        ('defaultTtlMin', 'default_ttl_min'), ('maxTtlMin', 'max_ttl_min'),
        ('revokeWebhookUrl', 'revoke_webhook_url'),
    ):
        if f in payload:
            setattr(tgt, attr, payload.get(f))
    if 'allowedHours' in payload:
        tgt.allowed_hours_json = _json_dumps(payload.get('allowedHours'))
    if 'ipAllowlist' in payload:
        tgt.ip_allowlist = _json_dumps(payload.get('ipAllowlist'))
    if 'isActive' in payload:
        tgt.is_active = bool(payload.get('isActive'))
    tgt.updated_at = datetime.utcnow()
    db.session.commit()
    return _ok(item=tgt.to_dict())


@messenger_phase2_bp.route('/api/admin/access-targets/bulk-delete', methods=['POST'])
def delete_access_targets():
    if not _require_user():
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    ids = payload.get('ids') or []
    AccTarget.query.filter(AccTarget.id.in_(ids)).update(
        {AccTarget.is_active: False, AccTarget.updated_at: datetime.utcnow()},
        synchronize_session=False,
    )
    db.session.commit()
    return _ok(deleted=len(ids))


# Requests

def _resolve_step_approvers(line: Optional[AccApprovalLine], step: int) -> Iterable[int]:
    if not line:
        return []
    try:
        steps = json.loads(line.steps_json or '[]')
    except Exception:
        return []
    for s in steps:
        if int(s.get('step') or 0) == int(step):
            ids = s.get('approver_user_ids') or s.get('approverUserIds') or []
            return [int(x) for x in ids if x is not None]
    return []


def _post_approval_card(req: AccRequest, target: AccTarget) -> Optional[MsgMessageV2]:
    if not target.notify_channel_id:
        return None
    ch = MsgChannel.query.get(target.notify_channel_id)
    if not ch:
        return None
    metadata = {
        'kind': 'approval_card',
        'requestId': req.id,
        'targetId': target.id,
        'targetName': target.name,
        'targetKind': target.kind,
        'requesterId': req.requester_id,
        'requesterName': req.requester.name if req.requester else None,
        'reason': req.reason,
        'requestedTtlMin': req.requested_ttl_min,
        'isEmergency': bool(req.is_emergency),
        'status': req.status,
        'currentStep': req.current_step,
    }
    body_lines = [
        f'[승인 요청] {target.name}',
        f'- 신청자: {req.requester.name if req.requester else req.requester_id}',
        f'- 대상: {target.name} ({target.kind})',
        f'- 사유: {req.reason}',
        f'- 요청 시간(분): {req.requested_ttl_min}',
    ]
    msg = MsgMessageV2(
        conversation_id=ch.conversation_id,
        sender_id=_system_bot_user_id() or req.requester_id,
        content='\n'.join(body_lines),
        message_type='approval_card',
        status='active',
        metadata_json=json.dumps(metadata, ensure_ascii=False),
    )
    db.session.add(msg)
    db.session.flush()

    conv = MsgConversation.query.get(ch.conversation_id)
    if conv:
        conv.last_message_id = msg.id
        conv.last_message_preview = (msg.content or '')[:200]
        conv.last_message_at = msg.created_at
        conv.updated_at = datetime.utcnow()

    line = AccApprovalLine.query.get(target.approval_line_id) if target.approval_line_id else None
    for approver_id in _resolve_step_approvers(line, req.current_step):
        notif = MsgNotification(
            user_id=approver_id,
            notification_type='approval',
            reference_type='access_request',
            reference_id=req.id,
            title=f'승인 요청: {target.name}',
            body=(req.reason or '')[:255],
        )
        db.session.add(notif)
        db.session.flush()
        _enqueue_push_safe(
            [approver_id],
            notif.title,
            notif.body,
            data={'type': 'approval_card', 'requestId': req.id, 'targetId': target.id},
            notification_id=notif.id,
        )
    return msg


@messenger_phase2_bp.route('/api/access/requests', methods=['POST'])
def create_access_request():
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    target_id = payload.get('targetId')
    reason = (payload.get('reason') or '').strip()
    if not target_id or not reason:
        return _err('targetId and reason are required')
    target = AccTarget.query.filter(AccTarget.id == target_id).first()
    if not target or not target.is_active:
        return _err('target not found', 404)
    requested_ttl = int(payload.get('requestedTtlMin') or target.default_ttl_min)
    if requested_ttl <= 0:
        return _err('requestedTtlMin must be positive')
    if requested_ttl > target.max_ttl_min:
        requested_ttl = target.max_ttl_min
    req = AccRequest(
        requester_id=uid,
        target_id=target.id,
        reason=reason,
        requested_ttl_min=requested_ttl,
        is_emergency=bool(payload.get('isEmergency')),
        status='pending',
        current_step=1,
    )
    db.session.add(req)
    db.session.flush()
    msg = _post_approval_card(req, target)
    if msg:
        req.source_message_id = msg.id
    db.session.commit()
    if msg:
        _notify_chat_event('chat.approval.card', msg.conversation_id, {
            'messageId': msg.id,
            'requestId': req.id,
            'targetId': target.id,
        })
    return _ok(item=req.to_dict())


@messenger_phase2_bp.route('/api/access/requests', methods=['GET'])
def list_access_requests():
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    role = request.args.get('role') or 'requester'
    status_filter = request.args.get('status')
    q = AccRequest.query
    if role == 'requester':
        q = q.filter(AccRequest.requester_id == uid)
    elif role == 'approver':
        # naive: list all pending — frontend gates by step assignment
        # production: join AccApprovalLine.steps to filter
        pass
    if status_filter:
        q = q.filter(AccRequest.status == status_filter)
    rows = q.order_by(AccRequest.id.desc()).limit(200).all()
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))


@messenger_phase2_bp.route('/api/access/requests/<int:rid>', methods=['GET'])
def get_access_request(rid: int):
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    req = AccRequest.query.get_or_404(rid)
    item = req.to_dict()
    item['approvals'] = [
        a.to_dict() for a in
        AccApproval.query.filter(AccApproval.request_id == rid).order_by(AccApproval.id.asc()).all()
    ]
    return _ok(item=item)


def _request_apply_approval(req: AccRequest, approver_id: int, decision: str, comment: Optional[str], ttl_override: Optional[int]) -> dict:
    target = AccTarget.query.get(req.target_id)
    line = AccApprovalLine.query.get(target.approval_line_id) if target and target.approval_line_id else None
    db.session.add(AccApproval(
        request_id=req.id,
        step=req.current_step,
        approver_id=approver_id,
        decision=decision,
        comment=comment,
    ))

    if decision == 'reject':
        req.status = 'rejected'
        req.updated_at = datetime.utcnow()
        notif = MsgNotification(
            user_id=req.requester_id,
            notification_type='approval',
            reference_type='access_request',
            reference_id=req.id,
            title='접근 신청 반려',
            body=(comment or '')[:255],
        )
        db.session.add(notif)
        db.session.flush()
        _enqueue_push_safe(
            [req.requester_id], notif.title, notif.body,
            data={'type': 'approval_result', 'requestId': req.id, 'status': 'rejected'},
            notification_id=notif.id,
        )
        return {'final': True}

    # approved
    total_steps = 1
    if line:
        try:
            steps = json.loads(line.steps_json or '[]')
            total_steps = max(1, len(steps))
        except Exception:
            total_steps = 1

    if req.current_step >= total_steps:
        req.status = 'approved'
        ttl = ttl_override or req.requested_ttl_min
        if target and ttl > target.max_ttl_min:
            ttl = target.max_ttl_min
        req.approved_at = datetime.utcnow()
        req.activated_at = datetime.utcnow()
        req.expires_at = datetime.utcnow() + timedelta(minutes=int(ttl))
        req.status = 'active'
        # call external grant webhook (fire-and-forget, short timeout)
        if target and target.revoke_webhook_url:
            _safe_webhook(target.revoke_webhook_url, {
                'event': 'access.granted',
                'requestId': req.id,
                'targetId': target.id,
                'targetKind': target.kind,
                'endpoint': target.endpoint,
                'requesterId': req.requester_id,
                'expiresAt': req.expires_at.isoformat() + 'Z',
            })
        notif = MsgNotification(
            user_id=req.requester_id,
            notification_type='approval',
            reference_type='access_request',
            reference_id=req.id,
            title='접근 신청 승인',
            body=f'만료: {req.expires_at.isoformat()}',
        )
        db.session.add(notif)
        db.session.flush()
        _enqueue_push_safe(
            [req.requester_id], notif.title, notif.body,
            data={'type': 'approval_result', 'requestId': req.id, 'status': 'active'},
            notification_id=notif.id,
        )
        return {'final': True}

    req.current_step += 1
    # notify next step approvers
    for next_uid in _resolve_step_approvers(line, req.current_step):
        notif = MsgNotification(
            user_id=next_uid,
            notification_type='approval',
            reference_type='access_request',
            reference_id=req.id,
            title='추가 승인 필요',
            body=(req.reason or '')[:255],
        )
        db.session.add(notif)
        db.session.flush()
        _enqueue_push_safe(
            [next_uid], notif.title, notif.body,
            data={'type': 'approval_card', 'requestId': req.id, 'step': req.current_step},
            notification_id=notif.id,
        )
    return {'final': False}


def _safe_webhook(url: str, body: dict, timeout: float = 3.0) -> None:
    try:
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(url, data=data, method='POST',
                                     headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req, timeout=timeout).close()
    except (urllib.error.URLError, OSError, ValueError) as exc:
        logger.warning('webhook %s failed: %s', url, exc)


@messenger_phase2_bp.route('/api/access/requests/<int:rid>/approve', methods=['POST'])
def approve_access_request(rid: int):
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    req = AccRequest.query.get_or_404(rid)
    if req.status not in ('pending',):
        return _err(f'cannot approve in status {req.status}', 409)
    payload, err = _json_or_400()
    if err:
        return err
    ttl = payload.get('ttlMin')
    comment = payload.get('comment')
    _request_apply_approval(req, uid, 'approve', comment, int(ttl) if ttl else None)
    db.session.commit()
    _notify_chat_event('chat.approval.update', None, {
        'requestId': req.id, 'status': req.status,
    })
    return _ok(item=req.to_dict())


@messenger_phase2_bp.route('/api/access/requests/<int:rid>/reject', methods=['POST'])
def reject_access_request(rid: int):
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    req = AccRequest.query.get_or_404(rid)
    if req.status not in ('pending',):
        return _err(f'cannot reject in status {req.status}', 409)
    payload, err = _json_or_400()
    if err:
        return err
    _request_apply_approval(req, uid, 'reject', payload.get('comment'), None)
    db.session.commit()
    _notify_chat_event('chat.approval.update', None, {
        'requestId': req.id, 'status': req.status,
    })
    return _ok(item=req.to_dict())


@messenger_phase2_bp.route('/api/access/requests/<int:rid>/revoke', methods=['POST'])
def revoke_access_request(rid: int):
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    req = AccRequest.query.get_or_404(rid)
    if req.status not in ('approved', 'active'):
        return _err(f'cannot revoke in status {req.status}', 409)
    payload, err = _json_or_400()
    if err:
        return err
    req.status = 'revoked'
    req.revoked_at = datetime.utcnow()
    req.revoked_by = uid
    req.revoke_reason = (payload.get('reason') or '').strip() or None
    target = AccTarget.query.get(req.target_id)
    if target and target.revoke_webhook_url:
        _safe_webhook(target.revoke_webhook_url, {
            'event': 'access.revoked',
            'requestId': req.id,
            'targetId': target.id,
            'reason': req.revoke_reason,
        })
    db.session.add(MsgNotification(
        user_id=req.requester_id,
        notification_type='approval',
        reference_type='access_request',
        reference_id=req.id,
        title='접근 권한 회수',
        body=req.revoke_reason or '관리자에 의해 회수되었습니다.',
    ))
    db.session.flush()
    _enqueue_push_safe(
        [req.requester_id], '접근 권한 회수',
        req.revoke_reason or '관리자에 의해 회수되었습니다.',
        data={'type': 'approval_result', 'requestId': req.id, 'status': 'revoked'},
    )
    db.session.commit()
    return _ok(item=req.to_dict())


# Sweep endpoint (intended to be hit by cron / scheduler)

@messenger_phase2_bp.route('/api/access/expire-sweep', methods=['POST'])
def expire_sweep():
    if not _require_user():
        return _err('unauthorized', 401)
    now = datetime.utcnow()
    rows = (
        AccRequest.query
        .filter(AccRequest.status.in_(('approved', 'active')))
        .filter(AccRequest.expires_at != None)  # noqa: E711
        .filter(AccRequest.expires_at < now)
        .all()
    )
    for r in rows:
        r.status = 'expired'
        r.updated_at = now
        target = AccTarget.query.get(r.target_id)
        if target and target.revoke_webhook_url:
            _safe_webhook(target.revoke_webhook_url, {
                'event': 'access.expired',
                'requestId': r.id,
                'targetId': target.id,
            })
        db.session.add(MsgNotification(
            user_id=r.requester_id,
            notification_type='approval',
            reference_type='access_request',
            reference_id=r.id,
            title='접근 만료',
            body=f'요청 #{r.id} 만료',
        ))
    db.session.commit()
    return _ok(expired=len(rows))


# ---------------------------------------------------------------------------
# Push Device — register / list / revoke (+ delivery stub)
# ---------------------------------------------------------------------------

@messenger_phase2_bp.route('/api/push/devices', methods=['POST'])
def register_push_device():
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    platform = (payload.get('platform') or '').lower()
    token = (payload.get('token') or '').strip()
    if platform not in ('ios', 'android', 'web'):
        return _err('platform must be ios|android|web')
    if not token or len(token) < 10:
        return _err('token is required')
    existing = PushDevice.query.filter(PushDevice.device_token == token).first()
    now = datetime.utcnow()
    if existing:
        existing.user_id = uid
        existing.platform = platform
        existing.device_name = payload.get('deviceName') or existing.device_name
        existing.app_version = payload.get('appVersion') or existing.app_version
        existing.os_version = payload.get('osVersion') or existing.os_version
        existing.last_ip = _client_ip()
        existing.last_seen_at = now
        existing.revoked_at = None
        db.session.commit()
        return _ok(item=existing.to_dict(), updated=True)
    dev = PushDevice(
        user_id=uid,
        platform=platform,
        device_token=token,
        device_name=payload.get('deviceName'),
        app_version=payload.get('appVersion'),
        os_version=payload.get('osVersion'),
        last_ip=_client_ip(),
    )
    db.session.add(dev)
    db.session.commit()
    return _ok(item=dev.to_dict(), updated=False)


@messenger_phase2_bp.route('/api/push/devices', methods=['GET'])
def list_push_devices():
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    rows = (
        PushDevice.query
        .filter(PushDevice.user_id == uid)
        .filter(PushDevice.revoked_at.is_(None))
        .order_by(PushDevice.id.desc())
        .all()
    )
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))


@messenger_phase2_bp.route('/api/push/devices/<int:did>', methods=['DELETE'])
def revoke_push_device(did: int):
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    dev = PushDevice.query.get_or_404(did)
    if dev.user_id != uid:
        return _err('forbidden', 403)
    dev.revoked_at = datetime.utcnow()
    db.session.commit()
    return _ok()


@messenger_phase2_bp.route('/api/admin/push/logs', methods=['GET'])
def list_push_logs():
    if not _require_user():
        return _err('unauthorized', 401)
    q = PushLog.query
    if request.args.get('userId', type=int):
        q = q.filter(PushLog.user_id == request.args.get('userId', type=int))
    if request.args.get('status'):
        q = q.filter(PushLog.status == request.args.get('status'))
    rows = q.order_by(PushLog.id.desc()).limit(200).all()
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))


@messenger_phase2_bp.route('/api/admin/push/test', methods=['POST'])
def test_push_send():
    """관리자가 자신(또는 지정 사용자)에게 테스트 푸시를 큐잉한다."""
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    payload, err = _json_or_400()
    if err:
        return err
    target_user_id = int(payload.get('userId') or uid)
    title = (payload.get('title') or '테스트 알림').strip()
    body = (payload.get('body') or 'Blossom 푸시 테스트').strip()
    try:
        from app.services.push_dispatch_service import enqueue_push_simple
        queued = enqueue_push_simple(
            user_ids=[target_user_id],
            title=title,
            body=body,
            data={'type': 'test', 'origin': 'admin'},
        )
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return _err(f'enqueue failed: {exc}', 500)
    return _ok({'queued': queued, 'userId': target_user_id})


# ---------------------------------------------------------------------------
# Message Search (FULLTEXT on MySQL, LIKE fallback on SQLite)
# ---------------------------------------------------------------------------

@messenger_phase2_bp.route('/api/chat/v2/search', methods=['GET'])
def search_messages_v2():
    uid = _require_user()
    if not uid:
        return _err('unauthorized', 401)
    keyword = (request.args.get('q') or '').strip()
    if len(keyword) < 2:
        return _err('q must be at least 2 characters')
    conv_id = request.args.get('conversationId', type=int)

    # Restrict to conversations the user can see:
    #  - public channels
    #  - conversations where they are an active member
    member_conv_ids = [
        m.conversation_id for m in
        MsgConversationMember.query
        .filter(MsgConversationMember.user_id == uid)
        .filter(MsgConversationMember.left_at.is_(None))
        .all()
    ]
    public_channel_conv_ids = [
        c.id for c in
        MsgConversation.query
        .filter(MsgConversation.conversation_type == 'CHANNEL')
        .filter(MsgConversation.visibility == 'public')
        .filter(MsgConversation.is_deleted.is_(False))
        .all()
    ]
    visible_ids = set(member_conv_ids) | set(public_channel_conv_ids)
    if conv_id and conv_id not in visible_ids:
        return _err('forbidden', 403)
    if conv_id:
        visible_ids = {conv_id}
    if not visible_ids:
        return _ok(rows=[], total=0)

    like = f'%{keyword}%'
    rows = (
        MsgMessageV2.query
        .filter(MsgMessageV2.conversation_id.in_(visible_ids))
        .filter(MsgMessageV2.status == 'active')
        .filter(MsgMessageV2.content.ilike(like))
        .order_by(MsgMessageV2.id.desc())
        .limit(100)
        .all()
    )
    return _ok(rows=[r.to_dict() for r in rows], total=len(rows))
