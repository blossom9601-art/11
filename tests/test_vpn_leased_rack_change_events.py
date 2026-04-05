"""Verify VPN, Leased Line, and RACK actions create centralized ChangeEvent records."""
import pytest
from app.models import NetVpnPartner, NetVpnLine, NetLeasedLine, db


# ── helpers ──

def _get_events(client, entity_type, entity_id):
    r = client.get('/api/change-events', query_string={
        'entity_type': entity_type, 'entity_id': str(entity_id),
    })
    data = r.get_json()
    return data.get('events', []) if data.get('success') else []


def _get_event_detail(client, event_id):
    r = client.get(f'/api/change-events/{event_id}')
    data = r.get_json()
    return data.get('event', {}) if data.get('success') else {}


# ── VPN fixtures ──

@pytest.fixture
def vpn_partner(app, actor_user_id):
    """Create a VPN partner for VPN line tests."""
    with app.app_context():
        p = NetVpnPartner(
            partner_type='DEFAULT',
            org_name='테스트 VPN 기관',
            created_by_user_id=actor_user_id,
            is_deleted=0,
        )
        db.session.add(p)
        db.session.commit()
        pid = p.id
    return pid


# ── VPN Tests ──

def test_vpn_create_records_change_event(authed_client, vpn_partner, actor_user_id):
    resp = authed_client.post('/api/network/vpn-lines', json={
        'vpn_partner_id': vpn_partner,
        'created_by_user_id': actor_user_id,
        'scope': 'VPN1',
        'protocol': 'IPSec',
        'line_speed': '100M',
    })
    assert resp.status_code == 201
    line_id = resp.get_json()['item']['id']

    events = _get_events(authed_client, 'network_vpn_line', line_id)
    creates = [e for e in events if e['action_type'] == 'CREATE']
    assert len(creates) >= 1


def test_vpn_update_records_change_event(authed_client, vpn_partner, actor_user_id):
    resp = authed_client.post('/api/network/vpn-lines', json={
        'vpn_partner_id': vpn_partner,
        'created_by_user_id': actor_user_id,
        'scope': 'VPN1',
        'protocol': 'IPSec',
    })
    line_id = resp.get_json()['item']['id']

    authed_client.put(f'/api/network/vpn-lines/{line_id}', json={
        'updated_by_user_id': actor_user_id,
        'protocol': 'SSL-VPN',
        'cipher': 'AES-256',
    })

    events = _get_events(authed_client, 'network_vpn_line', line_id)
    updates = [e for e in events if e['action_type'] == 'UPDATE']
    assert len(updates) >= 1

    detail = _get_event_detail(authed_client, updates[0]['id'])
    diff_fields = [d['field'] for d in (detail.get('diffs') or [])]
    assert '프로토콜' in diff_fields or '암호화' in diff_fields


def test_vpn_delete_records_change_event(authed_client, vpn_partner, actor_user_id):
    resp = authed_client.post('/api/network/vpn-lines', json={
        'vpn_partner_id': vpn_partner,
        'created_by_user_id': actor_user_id,
        'scope': 'VPN1',
    })
    line_id = resp.get_json()['item']['id']

    authed_client.delete(f'/api/network/vpn-lines/{line_id}', json={
        'actor_user_id': actor_user_id,
    })

    events = _get_events(authed_client, 'network_vpn_line', line_id)
    deletes = [e for e in events if e['action_type'] == 'DELETE']
    assert len(deletes) >= 1


# ── Leased Line Tests ──

def test_leased_line_create_records_change_event(authed_client, actor_user_id):
    resp = authed_client.post('/api/network/leased-lines', json={
        'line_group': 'MEMBER',
        'org_name': '테스트 기관',
        'status_code': 'ACTIVE',
        'line_no': 'LL-CE-001',
        'created_by': actor_user_id,
    })
    assert resp.status_code == 201
    line_id = resp.get_json()['item']['id']

    events = _get_events(authed_client, 'network_leased_line', line_id)
    creates = [e for e in events if e['action_type'] == 'CREATE']
    assert len(creates) >= 1


def test_leased_line_update_records_change_event(authed_client, actor_user_id):
    resp = authed_client.post('/api/network/leased-lines', json={
        'line_group': 'MEMBER',
        'org_name': '수정전기관',
        'status_code': 'ACTIVE',
        'line_no': 'LL-CE-002',
        'created_by': actor_user_id,
    })
    line_id = resp.get_json()['item']['id']

    authed_client.put(f'/api/network/leased-lines/{line_id}', json={
        'actor_user_id': actor_user_id,
        'org_name': '수정후기관',
        'speed_label': '100Mbps',
    })

    events = _get_events(authed_client, 'network_leased_line', line_id)
    updates = [e for e in events if e['action_type'] == 'UPDATE']
    assert len(updates) >= 1

    detail = _get_event_detail(authed_client, updates[0]['id'])
    diff_fields = [d['field'] for d in (detail.get('diffs') or [])]
    assert '기관명' in diff_fields or '속도' in diff_fields


def test_leased_line_delete_records_change_event(authed_client, actor_user_id):
    resp = authed_client.post('/api/network/leased-lines', json={
        'line_group': 'CUSTOMER',
        'org_name': '삭제기관',
        'status_code': 'ACTIVE',
        'line_no': 'LL-CE-003',
        'created_by': actor_user_id,
    })
    line_id = resp.get_json()['item']['id']

    authed_client.delete(f'/api/network/leased-lines/{line_id}', json={
        'actor_user_id': actor_user_id,
    })

    events = _get_events(authed_client, 'network_leased_line', line_id)
    deletes = [e for e in events if e['action_type'] == 'DELETE']
    assert len(deletes) >= 1


# ── RACK Tests ──

def test_rack_create_records_change_event(authed_client):
    resp = authed_client.post('/api/org-racks', json={
        'business_status_code': 'ACTIVE',
        'business_name': '테스트 랙',
        'center_code': 'CTR01',
        'rack_position': 'A-01',
    })
    assert resp.status_code == 201
    rack_id = resp.get_json()['item']['id']

    events = _get_events(authed_client, 'org_rack', rack_id)
    creates = [e for e in events if e['action_type'] == 'CREATE']
    assert len(creates) >= 1


def test_rack_update_records_change_event(authed_client):
    resp = authed_client.post('/api/org-racks', json={
        'business_status_code': 'ACTIVE',
        'business_name': '수정전 랙',
        'center_code': 'CTR01',
        'rack_position': 'B-01',
    })
    rack_id = resp.get_json()['item']['id']

    authed_client.put(f'/api/org-racks/{rack_id}', json={
        'business_name': '수정후 랙',
        'system_height_u': 42,
    })

    events = _get_events(authed_client, 'org_rack', rack_id)
    updates = [e for e in events if e['action_type'] == 'UPDATE']
    assert len(updates) >= 1

    detail = _get_event_detail(authed_client, updates[0]['id'])
    diff_fields = [d['field'] for d in (detail.get('diffs') or [])]
    # business_name is not in _IGNORE_FIELDS for org_rack but is in global _IGNORE_FIELDS
    # system_height_u should show as '랙 높이(U)'
    assert len(diff_fields) >= 1


def test_rack_delete_records_change_event(authed_client):
    resp = authed_client.post('/api/org-racks', json={
        'business_status_code': 'ACTIVE',
        'business_name': '삭제 랙',
        'center_code': 'CTR01',
        'rack_position': 'C-01',
    })
    rack_id = resp.get_json()['item']['id']

    authed_client.post('/api/org-racks/bulk-delete', json={
        'ids': [rack_id],
    })

    events = _get_events(authed_client, 'org_rack', rack_id)
    deletes = [e for e in events if e['action_type'] == 'DELETE']
    assert len(deletes) >= 1
