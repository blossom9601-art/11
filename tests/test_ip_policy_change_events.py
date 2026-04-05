"""Verify IP policy actions create centralized ChangeEvent records."""


def _get_event_detail(client, event_id):
    """Fetch full event detail including diffs."""
    r = client.get(f'/api/change-events/{event_id}')
    data = r.get_json()
    return data.get('event', {}) if data.get('success') else {}


def test_ip_policy_create_records_change_event(authed_client):
    """POST /api/network/ip-policies writes a ChangeEvent."""
    resp = authed_client.post('/api/network/ip-policies', json={
        'status': 'ACTIVE', 'ip_version': 'IPv4',
        'start_ip': '10.0.0.0', 'end_ip': '10.0.0.3',
        'policy_name': 'Test Range', 'policy_code': 'TEST_CE_CREATE',
    })
    assert resp.status_code == 201
    policy_id = resp.get_json()['item']['id']

    events = authed_client.get('/api/change-events', query_string={
        'entity_type': 'network_ip_policy', 'entity_id': str(policy_id),
    }).get_json()
    assert events['total'] >= 1
    ev = events['events'][0]
    assert ev['action_type'] == 'CREATE'
    assert 'Test Range' in ev['summary']


def test_ip_policy_update_no_duplicate_description(authed_client):
    """UPDATE diffs must NOT contain '설명' — only '비고' for the note field."""
    resp = authed_client.post('/api/network/ip-policies', json={
        'status': 'ACTIVE', 'ip_version': 'IPv4',
        'start_ip': '10.1.0.0', 'end_ip': '10.1.0.3',
        'policy_name': 'NoDup', 'policy_code': 'TEST_CE_NODUP',
    })
    policy_id = resp.get_json()['item']['id']

    authed_client.put(f'/api/network/ip-policies/{policy_id}', json={
        'description': 'new note',
    })

    events = authed_client.get('/api/change-events', query_string={
        'entity_type': 'network_ip_policy', 'entity_id': str(policy_id),
    }).get_json()
    update_events = [e for e in events['events'] if e['action_type'] == 'UPDATE']
    assert len(update_events) >= 1

    detail = _get_event_detail(authed_client, update_events[0]['id'])
    diff_fields = [d['field'] for d in (detail.get('diffs') or [])]
    # '비고' should be present instead of '설명'
    assert '설명' not in diff_fields, f'설명 found in diffs: {diff_fields}'
    assert '비고' in diff_fields


def test_ip_policy_update_records_change_event(authed_client):
    """PUT /api/network/ip-policies/<id> writes an UPDATE event with diffs."""
    resp = authed_client.post('/api/network/ip-policies', json={
        'status': 'ACTIVE', 'ip_version': 'IPv4',
        'start_ip': '10.1.0.0', 'end_ip': '10.1.0.3',
        'policy_name': 'Before', 'policy_code': 'TEST_CE_UPDATE',
    })
    policy_id = resp.get_json()['item']['id']

    authed_client.put(f'/api/network/ip-policies/{policy_id}', json={
        'policy_name': 'After', 'role': 'MGMT',
    })

    events = authed_client.get('/api/change-events', query_string={
        'entity_type': 'network_ip_policy', 'entity_id': str(policy_id),
    }).get_json()
    update_events = [e for e in events['events'] if e['action_type'] == 'UPDATE']
    assert len(update_events) >= 1


def test_ip_policy_delete_records_change_event(authed_client):
    """DELETE /api/network/ip-policies/<id> writes a DELETE event."""
    resp = authed_client.post('/api/network/ip-policies', json={
        'status': 'ACTIVE', 'start_ip': '10.2.0.0', 'end_ip': '10.2.0.3',
        'policy_name': 'ToDelete', 'policy_code': 'TEST_CE_DELETE',
    })
    policy_id = resp.get_json()['item']['id']

    authed_client.delete(f'/api/network/ip-policies/{policy_id}')

    events = authed_client.get('/api/change-events', query_string={
        'entity_type': 'network_ip_policy', 'entity_id': str(policy_id),
    }).get_json()
    delete_events = [e for e in events['events'] if e['action_type'] == 'DELETE']
    assert len(delete_events) >= 1
    assert 'ToDelete' in delete_events[0]['summary']


def test_ip_address_save_records_change_event(authed_client):
    """PUT addresses writes per-IP change events."""
    resp = authed_client.post('/api/network/ip-policies', json={
        'status': 'ACTIVE', 'ip_version': 'IPv4',
        'start_ip': '10.3.0.0', 'end_ip': '10.3.0.3',
        'policy_name': 'AddrTest', 'policy_code': 'TEST_CE_ADDR',
    })
    policy_id = resp.get_json()['item']['id']

    # First save: creates new address data
    save_resp = authed_client.put(
        f'/api/network/ip-policies/{policy_id}/addresses',
        json={'items': [{
            'ip_address': '10.3.0.1', 'status': '활성',
            'role': 'VIP', 'dns_domain': 'a.com',
            'system_name': 'SYS-A', 'port': '443', 'note': 'initial',
        }]},
    )
    assert save_resp.status_code == 200

    events = authed_client.get('/api/change-events', query_string={
        'entity_type': 'network_ip_policy', 'entity_id': str(policy_id),
    }).get_json()
    # Should have CREATE event for policy + at least one address event
    addr_events = [e for e in events['events'] if 'IP 10.3.0.1' in (e.get('summary') or '')]
    assert len(addr_events) >= 1


def test_ip_diagram_create_records_change_event(authed_client):
    """POST /api/network/ip-diagrams writes a change event under 구성/파일."""
    # Create a policy first
    resp = authed_client.post('/api/network/ip-policies', json={
        'status': 'ACTIVE', 'ip_version': 'IPv4',
        'start_ip': '10.4.0.0', 'end_ip': '10.4.0.3',
        'policy_name': 'FileTest', 'policy_code': 'TEST_CE_FILE',
    })
    policy_id = resp.get_json()['item']['id']

    # Upload a diagram
    diag_resp = authed_client.post('/api/network/ip-diagrams', json={
        'policy_id': policy_id,
        'entry_type': 'DIAGRAM',
        'file_name': 'network_map.png',
        'file_size': 12345,
        'is_primary': True,
    })
    assert diag_resp.status_code == 201

    events = authed_client.get('/api/change-events', query_string={
        'entity_type': 'network_ip_policy', 'entity_id': str(policy_id),
    }).get_json()
    file_events = [e for e in events['events'] if '구성/파일' in (e.get('page_key') or '')]
    assert len(file_events) >= 1
    assert '파일 추가' in file_events[0]['summary']


def test_ip_diagram_delete_records_change_event(authed_client):
    """DELETE /api/network/ip-diagrams/<id> writes a change event under 구성/파일."""
    resp = authed_client.post('/api/network/ip-policies', json={
        'status': 'ACTIVE', 'ip_version': 'IPv4',
        'start_ip': '10.5.0.0', 'end_ip': '10.5.0.3',
        'policy_name': 'FileDelTest', 'policy_code': 'TEST_CE_FILE_DEL',
    })
    policy_id = resp.get_json()['item']['id']

    diag_resp = authed_client.post('/api/network/ip-diagrams', json={
        'policy_id': policy_id,
        'entry_type': 'ATTACHMENT',
        'file_name': 'readme.pdf',
        'file_size': 5000,
    })
    diagram_id = diag_resp.get_json()['item']['id']

    del_resp = authed_client.delete(f'/api/network/ip-diagrams/{diagram_id}')
    assert del_resp.status_code == 200

    events = authed_client.get('/api/change-events', query_string={
        'entity_type': 'network_ip_policy', 'entity_id': str(policy_id),
    }).get_json()
    del_events = [e for e in events['events']
                  if e['action_type'] == 'DELETE' and '파일 삭제' in (e.get('summary') or '')]
    assert len(del_events) >= 1
    assert 'readme.pdf' in del_events[0]['summary']
