"""End-to-end smoke for messenger Phase 2: Event Bridge / Access Approval / Push.

These tests intentionally stay at the API contract level — model-level edge
cases are exercised through the same endpoints to keep coverage focused on
the wire format.
"""
from __future__ import annotations

import json

import pytest

from app.models import (
    AccApprovalLine,
    AccTarget,
    EvtRule,
    EvtSource,
    MsgChannel,
    MsgConversation,
    MsgConversationMember,
    db,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_channel_for_tests(app, owner_id: int, name: str = '#alerts') -> MsgChannel:
    with app.app_context():
        conv = MsgConversation(
            conversation_type='CHANNEL',
            visibility='public',
            title=name,
            owner_user_id=owner_id,
            created_by=owner_id,
        )
        db.session.add(conv)
        db.session.flush()
        ch = MsgChannel(
            conversation_id=conv.id,
            name=name,
            slug=name.lstrip('#'),
            channel_type='public',
            created_by=owner_id,
        )
        db.session.add(ch)
        db.session.add(MsgConversationMember(
            conversation_id=conv.id,
            user_id=owner_id,
            role='owner',
        ))
        db.session.commit()
        return ch.id, conv.id


# ---------------------------------------------------------------------------
# Event Bridge
# ---------------------------------------------------------------------------

def test_event_source_create_and_webhook_post(app, authed_client, actor_user_id):
    channel_id, conv_id = _create_channel_for_tests(app, actor_user_id, '#wazuh-alerts')

    # Create event source
    res = authed_client.post('/api/admin/event-sources', json={
        'name': 'wazuh-test',
        'kind': 'wazuh',
        'description': '테스트 소스',
    })
    assert res.status_code == 200
    src = res.get_json()['item']
    token = src['webhookToken']

    # Create matching rule
    res = authed_client.post('/api/admin/event-rules', json={
        'sourceId': src['id'],
        'name': 'CPU 95% 초과',
        'priority': 10,
        'severity': 'critical',
        'match': [
            {'path': 'rule.level', 'op': 'gte', 'value': 10},
            {'path': 'host', 'op': 'eq', 'value': 'WEB-01'},
        ],
        'targetChannelId': channel_id,
        'titleTemplate': '[CRITICAL] {host} CPU 임계 초과',
        'bodyTemplate': '레벨 {rule.level} / 메시지: {msg}',
        'dedupeKeyTemplate': '{host}:cpu',
        'dedupeWindowSec': 5,
    })
    assert res.status_code == 200, res.get_json()
    rule = res.get_json()['item']
    assert rule['severity'] == 'critical'

    # POST webhook (no signature — secret enforcement only when set explicitly above)
    # Our create_event_source generated a secret, so we need to send a valid signature.
    import hashlib, hmac
    body = json.dumps({
        'host': 'WEB-01',
        'rule': {'level': 12, 'id': 40111},
        'msg': 'CPU 95%',
        'ts': '2026-04-24T14:22:00Z',
    }).encode('utf-8')

    # Re-fetch source to grab its secret (admin endpoint redacts it). Read from DB.
    with app.app_context():
        src_row = EvtSource.query.get(src['id'])
        secret = src_row.secret
    sig = hmac.new(secret.encode('utf-8'), body, hashlib.sha256).hexdigest()

    res = authed_client.post(
        f'/api/events/in/{token}',
        data=body,
        content_type='application/json',
        headers={'X-Signature': f'sha256={sig}'},
    )
    assert res.status_code == 200, res.get_json()
    payload = res.get_json()
    assert payload['matched'] is True
    assert payload['messageId'] is not None

    # Replaying within dedupe window → suppressed
    sig2 = hmac.new(secret.encode('utf-8'), body, hashlib.sha256).hexdigest()
    res = authed_client.post(
        f'/api/events/in/{token}',
        data=body,
        content_type='application/json',
        headers={'X-Signature': f'sha256={sig2}'},
    )
    assert res.status_code == 200
    assert res.get_json()['suppressed'] is True

    # Bad signature → 401
    res = authed_client.post(
        f'/api/events/in/{token}',
        data=body,
        content_type='application/json',
        headers={'X-Signature': 'sha256=deadbeef'},
    )
    assert res.status_code == 401


def test_event_rule_test_endpoint(app, authed_client, actor_user_id):
    channel_id, _ = _create_channel_for_tests(app, actor_user_id, '#test-rules')
    res = authed_client.post('/api/admin/event-rules', json={
        'name': '단순 매칭',
        'severity': 'warning',
        'match': [{'path': 'kind', 'op': 'eq', 'value': 'cpu'}],
        'targetChannelId': channel_id,
        'titleTemplate': '{host} {kind}',
    })
    rule_id = res.get_json()['item']['id']

    # Matching payload
    r = authed_client.post(f'/api/admin/event-rules/{rule_id}/test', json={
        'payload': {'host': 'A1', 'kind': 'cpu'},
    })
    body = r.get_json()
    assert body['matched'] is True
    assert body['preview']['title'] == 'A1 cpu'

    # Non-matching payload
    r = authed_client.post(f'/api/admin/event-rules/{rule_id}/test', json={
        'payload': {'host': 'A1', 'kind': 'mem'},
    })
    assert r.get_json()['matched'] is False


# ---------------------------------------------------------------------------
# Access Approval
# ---------------------------------------------------------------------------

def test_access_request_single_step_flow(app, authed_client, authed_client2,
                                          actor_user_id, actor_user_id2):
    channel_id, _ = _create_channel_for_tests(app, actor_user_id, '#access-approvals')

    # Approval line: 1 step, approver = actor2
    res = authed_client.post('/api/admin/approval-lines', json={
        'name': '기본 승인선',
        'isDefault': True,
        'steps': [{'step': 1, 'role': 'team_lead', 'approver_user_ids': [actor_user_id2]}],
    })
    assert res.status_code == 200
    line_id = res.get_json()['item']['id']

    # Target
    res = authed_client.post('/api/admin/access-targets', json={
        'name': 'WEB-01 SSH',
        'kind': 'ssh',
        'endpoint': 'ssh://web-01',
        'approvalLineId': line_id,
        'notifyChannelId': channel_id,
        'defaultTtlMin': 60,
        'maxTtlMin': 120,
    })
    target_id = res.get_json()['item']['id']

    # Requester (actor1) creates request
    res = authed_client.post('/api/access/requests', json={
        'targetId': target_id,
        'reason': '야간 점검',
        'requestedTtlMin': 90,
    })
    assert res.status_code == 200
    req = res.get_json()['item']
    assert req['status'] == 'pending'
    rid = req['id']

    # Approver (actor2) approves
    res = authed_client2.post(f'/api/access/requests/{rid}/approve', json={
        'ttlMin': 30,
        'comment': 'OK',
    })
    assert res.status_code == 200, res.get_json()
    after = res.get_json()['item']
    assert after['status'] == 'active'
    assert after['expiresAt'] is not None

    # Detail with approvals
    res = authed_client.get(f'/api/access/requests/{rid}')
    detail = res.get_json()['item']
    assert len(detail['approvals']) == 1
    assert detail['approvals'][0]['decision'] == 'approve'

    # Revoke
    res = authed_client.post(f'/api/access/requests/{rid}/revoke', json={
        'reason': '점검 완료',
    })
    assert res.status_code == 200
    assert res.get_json()['item']['status'] == 'revoked'


def test_access_request_reject_flow(app, authed_client, authed_client2,
                                     actor_user_id, actor_user_id2):
    channel_id, _ = _create_channel_for_tests(app, actor_user_id, '#access-reject')
    res = authed_client.post('/api/admin/approval-lines', json={
        'name': 'r-line', 'isDefault': False,
        'steps': [{'step': 1, 'approver_user_ids': [actor_user_id2]}],
    })
    line_id = res.get_json()['item']['id']
    res = authed_client.post('/api/admin/access-targets', json={
        'name': 'DB-01', 'kind': 'db', 'approvalLineId': line_id,
        'notifyChannelId': channel_id,
    })
    target_id = res.get_json()['item']['id']
    res = authed_client.post('/api/access/requests', json={
        'targetId': target_id, 'reason': 'data export',
    })
    rid = res.get_json()['item']['id']

    res = authed_client2.post(f'/api/access/requests/{rid}/reject', json={
        'comment': '사유 미흡',
    })
    assert res.status_code == 200
    assert res.get_json()['item']['status'] == 'rejected'


def test_access_request_validation(app, authed_client, actor_user_id):
    res = authed_client.post('/api/access/requests', json={'targetId': 9999, 'reason': 'x'})
    assert res.status_code == 404
    res = authed_client.post('/api/access/requests', json={'reason': 'no target'})
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# Push Device
# ---------------------------------------------------------------------------

def test_push_device_register_list_revoke(authed_client):
    res = authed_client.post('/api/push/devices', json={
        'platform': 'ios',
        'token': 'A' * 64,
        'deviceName': 'iPhone 15',
        'appVersion': '1.0.0',
    })
    assert res.status_code == 200
    item = res.get_json()['item']
    did = item['id']
    assert item['platform'] == 'ios'

    # Re-register same token → updated
    res = authed_client.post('/api/push/devices', json={
        'platform': 'ios', 'token': 'A' * 64, 'deviceName': 'iPhone 15 Pro',
    })
    assert res.get_json()['updated'] is True

    res = authed_client.get('/api/push/devices')
    rows = res.get_json()['rows']
    assert any(r['id'] == did for r in rows)

    res = authed_client.delete(f'/api/push/devices/{did}')
    assert res.status_code == 200

    res = authed_client.get('/api/push/devices')
    assert all(r['id'] != did for r in res.get_json()['rows'])


def test_push_device_validation(authed_client):
    res = authed_client.post('/api/push/devices', json={'platform': 'pebble', 'token': 'x' * 20})
    assert res.status_code == 400
    res = authed_client.post('/api/push/devices', json={'platform': 'ios', 'token': 'short'})
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def test_message_search_visibility(app, authed_client, actor_user_id):
    channel_id, conv_id = _create_channel_for_tests(app, actor_user_id, '#search-test')
    # Insert messages directly
    from app.models import MsgMessageV2
    with app.app_context():
        for txt in ['장애 발생 보고', '점심 메뉴', '디스크 사용률 임계']:
            db.session.add(MsgMessageV2(
                conversation_id=conv_id,
                sender_id=actor_user_id,
                content=txt,
                message_type='text',
                status='active',
            ))
        db.session.commit()

    res = authed_client.get('/api/chat/v2/search?q=장애')
    assert res.status_code == 200
    rows = res.get_json()['rows']
    assert any('장애' in (r['content'] or '') for r in rows)

    res = authed_client.get('/api/chat/v2/search?q=a')
    assert res.status_code == 400  # too short

# ---------------------------------------------------------------------------
# Push Dispatch (queue + worker)
# ---------------------------------------------------------------------------

def test_push_enqueue_creates_queued_logs(app, authed_client, actor_user_id):
    """디바이스 등록 후 enqueue_push → push_log에 queued 행이 생긴다."""
    res = authed_client.post('/api/push/devices', json={
        'platform': 'android', 'token': 'D' * 64, 'deviceName': 'Pixel-8',
    })
    assert res.status_code == 200

    from app.models import PushLog
    from app.services.push_dispatch_service import enqueue_push_simple

    with app.app_context():
        n = enqueue_push_simple(
            user_ids=[actor_user_id],
            title='hello',
            body='world',
            data={'k': 'v'},
        )
        db.session.commit()
        assert n >= 1
        rows = PushLog.query.filter(PushLog.user_id == actor_user_id).all()
        assert any(r.status == 'queued' for r in rows)


def test_push_dispatch_skipped_when_no_credentials(app, authed_client, actor_user_id, monkeypatch):
    """FCM/APNs 자격증명이 없으면 워커가 status=skipped로 처리한다."""
    res = authed_client.post('/api/push/devices', json={
        'platform': 'android', 'token': 'E' * 64, 'deviceName': 'Pixel-8',
    })
    assert res.status_code == 200

    # Strip any creds that may exist in CI env
    for k in ('FCM_PROJECT_ID', 'FCM_SERVICE_ACCOUNT_JSON', 'FCM_LEGACY_SERVER_KEY',
              'APNS_TEAM_ID', 'APNS_KEY_ID', 'APNS_AUTH_KEY_PATH', 'APNS_BUNDLE_ID',
              'WEBPUSH_VAPID_PUBLIC', 'WEBPUSH_VAPID_PRIVATE', 'WEBPUSH_SUBJECT'):
        monkeypatch.delenv(k, raising=False)

    from app.models import PushLog
    from app.services.push_dispatch_service import enqueue_push_simple, _process_batch

    with app.app_context():
        enqueue_push_simple(user_ids=[actor_user_id], title='t', body='b')
        db.session.commit()
        processed = _process_batch()
        assert processed >= 1
        # All recent logs for this user should now be skipped (no creds)
        rows = (PushLog.query
                .filter(PushLog.user_id == actor_user_id)
                .order_by(PushLog.id.desc()).limit(5).all())
        assert any(r.status == 'skipped' for r in rows)
        assert all(r.status != 'queued' for r in rows[:1])


def test_push_dispatch_simulated_send(app, authed_client, actor_user_id, monkeypatch):
    """sender 함수를 모킹하여 status=sent 결과를 검증."""
    res = authed_client.post('/api/push/devices', json={
        'platform': 'android', 'token': 'F' * 64, 'deviceName': 'Pixel-8',
    })
    assert res.status_code == 200

    from app.models import PushLog
    from app.services import push_dispatch_service as pds

    def _fake_sender(token, payload):
        return True, None, None

    monkeypatch.setattr(pds, '_sender_for_provider', lambda provider: _fake_sender)

    with app.app_context():
        pds.enqueue_push_simple(user_ids=[actor_user_id], title='ok', body='go')
        db.session.commit()
        pds._process_batch()
        rows = (PushLog.query
                .filter(PushLog.user_id == actor_user_id)
                .order_by(PushLog.id.desc()).limit(3).all())
        assert any(r.status == 'sent' for r in rows)


def test_admin_push_test_endpoint(authed_client):
    """관리자 테스트 엔드포인트는 디바이스가 없어도 200 반환 (queued=0)."""
    res = authed_client.post('/api/admin/push/test', json={'title': 'hi', 'body': 'there'})
    assert res.status_code == 200
    assert 'queued' in res.get_json()
