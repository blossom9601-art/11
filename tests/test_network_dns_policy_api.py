def test_network_dns_policy_list_empty(client):
    response = client.get('/api/network/dns-policies')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_network_dns_policy_crud_flow(client):
    create_payload = {
        'status': '활성',
        'domain': 'example.com',
        'record_count': 12,
        'dns_type': 'Primary',
        'managed_by': 'Internal',
        'role': '외부',
        'remark': 'primary domain',
    }
    create_resp = client.post('/api/network/dns-policies', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['status'] == '활성'
    assert item['domain'] == 'example.com'
    assert item['record_count'] == 12
    assert item['dns_type'] == 'Primary'
    assert item['managed_by'] == 'Internal'
    assert item['ttl'] == 3600
    assert item['role'] == '외부'
    policy_id = item['id']

    detail_resp = client.get(f'/api/network/dns-policies/{policy_id}')
    assert detail_resp.status_code == 200
    detail = detail_resp.get_json()
    assert detail['item']['id'] == policy_id

    update_payload = {
        'status': '예약',
        'record_count': 5,
        'dns_type': 'Secondary',
        'ttl': 7200,
        'managed_by': 'External',
        'role': '내부',
        'note': 'updated entry',
    }
    update_resp = client.put(f'/api/network/dns-policies/{policy_id}', json=update_payload)
    assert update_resp.status_code == 200
    updated = update_resp.get_json()['item']
    assert updated['status'] == '예약'
    assert updated['record_count'] == 5
    assert updated['dns_type'] == 'Secondary'
    assert updated['managed_by'] == 'External'
    assert updated['ttl'] == 7200
    assert updated['role'] == '내부'
    assert updated['remark'] == 'updated entry'

    list_resp = client.get('/api/network/dns-policies?q=example')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['domain'] == 'example.com'

    delete_resp = client.delete(f'/api/network/dns-policies/{policy_id}')
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    secondary_payload = {
        'status': '활성',
        'domain': 'cdn.example.com',
        'record_count': 3,
        'role': 'CDN',
    }
    second_resp = client.post('/api/network/dns-policies', json=secondary_payload)
    assert second_resp.status_code == 201
    second_id = second_resp.get_json()['item']['id']

    bulk_resp = client.post('/api/network/dns-policies/bulk-delete', json={'ids': [second_id]})
    assert bulk_resp.status_code == 200
    bulk_payload = bulk_resp.get_json()
    assert bulk_payload['success'] is True
    assert bulk_payload['deleted'] == 1

    final_list = client.get('/api/network/dns-policies')
    assert final_list.status_code == 200
    assert final_list.get_json()['total'] == 0


def test_network_dns_record_update_log_includes_changes(authed_client):
    import json

    create_policy = {
        'status': '활성',
        'domain': 'example.com',
        'role': '테스트',
    }
    policy_resp = authed_client.post('/api/network/dns-policies', json=create_policy)
    assert policy_resp.status_code == 201
    policy_id = policy_resp.get_json()['item']['id']

    create_record = {
        'record_type': 'A',
        'host_name': 'www',
        'ip_address': '10.0.0.10',
        'status': '활성',
        'remark': 'seed',
    }
    rec_resp = authed_client.post(f'/api/network/dns-policies/{policy_id}/records', json=create_record)
    assert rec_resp.status_code == 201, rec_resp.get_data(as_text=True)
    record_id = rec_resp.get_json()['item']['id']

    update_payload = {
        'ip_address': '10.0.0.11',
    }
    upd_resp = authed_client.put(
        f'/api/network/dns-policies/{policy_id}/records/{record_id}',
        json=update_payload,
    )
    assert upd_resp.status_code == 200

    logs_resp = authed_client.get(f'/api/network/dns-policies/{policy_id}/logs?page=1&page_size=50')
    assert logs_resp.status_code == 200
    logs = logs_resp.get_json()
    assert logs['success'] is True

    matched = None
    for it in logs.get('items') or []:
        if it.get('tab_key') == 'gov_dns_policy_dns_record' and it.get('action') == 'UPDATE' and it.get('entity_id') == record_id:
            matched = it
            break
    assert matched is not None

    detail = json.loads(matched.get('detail') or '{}')
    assert 'changes' in detail
    assert detail.get('changed_fields', 0) >= 1
    assert 'ip_address' in (detail.get('changes') or {})


def test_network_dns_record_full_payload_only_one_field_changes(authed_client):
    import json

    policy_resp = authed_client.post(
        '/api/network/dns-policies',
        json={'status': '활성', 'domain': 'example.com', 'role': '테스트'},
    )
    assert policy_resp.status_code == 201
    policy_id = policy_resp.get_json()['item']['id']

    rec_resp = authed_client.post(
        f'/api/network/dns-policies/{policy_id}/records',
        json={'record_type': 'A', 'host_name': 'www', 'ip_address': '10.0.0.10', 'status': '활성', 'ttl': 3600, 'service_name': 'svc', 'remark': 'seed'},
    )
    assert rec_resp.status_code == 201, rec_resp.get_data(as_text=True)
    record = rec_resp.get_json()['item']
    record_id = record['id']

    # Simulate UI sending a full payload (many fields) but only remark changes.
    update_payload = {
        'status': record.get('status'),
        'record_type': record.get('record_type'),
        'host_name': record.get('host_name'),
        'ip_address': record.get('ip_address'),
        'priority': record.get('priority'),
        'ttl': record.get('ttl'),
        'service_name': record.get('service_name'),
        'remark': 'changed-remark',
        # include a meta field that should be ignored by logging
        'created_at': record.get('created_at'),
    }
    upd_resp = authed_client.put(
        f'/api/network/dns-policies/{policy_id}/records/{record_id}',
        json=update_payload,
    )
    assert upd_resp.status_code == 200, upd_resp.get_data(as_text=True)

    logs_resp = authed_client.get(f'/api/network/dns-policies/{policy_id}/logs?page=1&page_size=50')
    assert logs_resp.status_code == 200
    logs = logs_resp.get_json()
    assert logs['success'] is True

    matched = None
    for it in logs.get('items') or []:
        if it.get('tab_key') == 'gov_dns_policy_dns_record' and it.get('action') == 'UPDATE' and it.get('entity_id') == record_id:
            matched = it
            break
    assert matched is not None

    detail = json.loads(matched.get('detail') or '{}')
    changes = detail.get('changes') or {}
    assert set(changes.keys()) == {'remark'}


def test_dns_logs_api_backfills_legacy_update_changes_for_records(authed_client):
    import json

    # Create policy + record (normal).
    policy_resp = authed_client.post(
        '/api/network/dns-policies',
        json={'status': '활성', 'domain': 'example.com', 'role': '테스트'},
    )
    assert policy_resp.status_code == 201
    policy_id = policy_resp.get_json()['item']['id']

    rec_resp = authed_client.post(
        f'/api/network/dns-policies/{policy_id}/records',
        json={'record_type': 'A', 'host_name': 'www', 'ip_address': '10.0.0.10', 'status': '활성', 'remark': 'seed'},
    )
    assert rec_resp.status_code == 201
    record = rec_resp.get_json()['item']
    record_id = record['id']

    # Inject a legacy-style UPDATE log row: payload only, no changes.
    from app.services.network_dns_policy_log_service import append_network_dns_policy_log

    append_network_dns_policy_log(
        policy_id,
        tab_key='gov_dns_policy_dns_record',
        entity='RECORD',
        entity_id=record_id,
        action='UPDATE',
        actor='ADMIN',
        message='DNS 레코드 수정(legacy)',
        diff={'payload': {'remark': 'changed-remark'}},
    )

    logs_resp = authed_client.get(f'/api/network/dns-policies/{policy_id}/logs?page=1&page_size=50')
    assert logs_resp.status_code == 200
    logs = logs_resp.get_json()
    assert logs['success'] is True

    matched = None
    for it in logs.get('items') or []:
        if it.get('tab_key') == 'gov_dns_policy_dns_record' and it.get('action') == 'UPDATE' and it.get('entity_id') == record_id and 'legacy' in (it.get('message') or ''):
            matched = it
            break
    assert matched is not None

    detail = json.loads(matched.get('detail') or '{}')
    assert isinstance(detail.get('changes'), dict) and detail.get('changes')
    assert set(detail.get('changes').keys()) == {'remark'}


def test_network_dns_record_create_log_includes_changes(authed_client):
    import json

    policy_resp = authed_client.post(
        '/api/network/dns-policies',
        json={'status': '활성', 'domain': 'example.com', 'role': '테스트'},
    )
    assert policy_resp.status_code == 201
    policy_id = policy_resp.get_json()['item']['id']

    create_record = {
        'record_type': 'A',
        'host_name': 'www',
        'ip_address': '10.0.0.10',
        'status': '활성',
        'remark': 'seed',
    }
    rec_resp = authed_client.post(f'/api/network/dns-policies/{policy_id}/records', json=create_record)
    assert rec_resp.status_code == 201, rec_resp.get_data(as_text=True)
    record_id = rec_resp.get_json()['item']['id']

    logs_resp = authed_client.get(f'/api/network/dns-policies/{policy_id}/logs?page=1&page_size=50')
    assert logs_resp.status_code == 200
    logs = logs_resp.get_json()
    assert logs['success'] is True

    matched = None
    for it in logs.get('items') or []:
        if it.get('tab_key') == 'gov_dns_policy_dns_record' and it.get('action') == 'CREATE' and it.get('entity_id') == record_id:
            matched = it
            break
    assert matched is not None

    detail = json.loads(matched.get('detail') or '{}')
    assert 'changes' in detail
    assert detail.get('changed_fields', 0) >= 1
    # Allow service-side key variations; but at least one core record field must be present.
    keys = set((detail.get('changes') or {}).keys())
    assert keys & {'record_type', 'type', 'host_name', 'host', 'fqdn', 'ip_address', 'ip'}


def test_network_dns_diagram_update_log_includes_changes(authed_client):
    import json

    policy_resp = authed_client.post(
        '/api/network/dns-policies',
        json={'status': '활성', 'domain': 'example.com', 'role': '테스트'},
    )
    assert policy_resp.status_code == 201
    policy_id = policy_resp.get_json()['item']['id']

    create_diagram = {
        'policy_id': policy_id,
        'entry_type': 'DIAGRAM',
        'title': 'seed',
        'file_name': 'topology.png',
        'file_size': 123,
        'mime_type': 'image/png',
        'is_primary': True,
    }
    diag_resp = authed_client.post('/api/network/dns-diagrams', json=create_diagram)
    assert diag_resp.status_code == 201, diag_resp.get_data(as_text=True)
    diagram_id = diag_resp.get_json()['item']['id']

    update_payload = {
        'entry_type': 'DIAGRAM',
        'title': 'updated',
        'description': 'changed-desc',
        'file_name': 'topology.png',
        'file_size': 123,
        'mime_type': 'image/png',
        'is_primary': True,
    }
    upd_resp = authed_client.put(f'/api/network/dns-diagrams/{diagram_id}', json=update_payload)
    assert upd_resp.status_code == 200

    logs_resp = authed_client.get(f'/api/network/dns-policies/{policy_id}/logs?page=1&page_size=50')
    assert logs_resp.status_code == 200
    logs = logs_resp.get_json()
    assert logs['success'] is True

    matched = None
    for it in logs.get('items') or []:
        if it.get('tab_key') == 'gov_dns_policy_file' and it.get('action') == 'UPDATE' and it.get('entity_id') == diagram_id:
            matched = it
            break
    assert matched is not None

    detail = json.loads(matched.get('detail') or '{}')
    assert 'changes' in detail
    assert detail.get('changed_fields', 0) >= 1
    assert 'description' in (detail.get('changes') or {})


def test_network_dns_diagram_create_log_includes_changes(authed_client):
    import json

    policy_resp = authed_client.post(
        '/api/network/dns-policies',
        json={'status': '활성', 'domain': 'example.com', 'role': '테스트'},
    )
    assert policy_resp.status_code == 201
    policy_id = policy_resp.get_json()['item']['id']

    create_diagram = {
        'policy_id': policy_id,
        'entry_type': 'DIAGRAM',
        'title': 'seed',
        'file_name': 'topology.png',
        'file_size': 123,
        'mime_type': 'image/png',
        'is_primary': True,
    }
    diag_resp = authed_client.post('/api/network/dns-diagrams', json=create_diagram)
    assert diag_resp.status_code == 201, diag_resp.get_data(as_text=True)
    diagram_id = diag_resp.get_json()['item']['id']

    logs_resp = authed_client.get(f'/api/network/dns-policies/{policy_id}/logs?page=1&page_size=50')
    assert logs_resp.status_code == 200
    logs = logs_resp.get_json()
    assert logs['success'] is True

    matched = None
    for it in logs.get('items') or []:
        if it.get('tab_key') == 'gov_dns_policy_file' and it.get('action') == 'CREATE' and it.get('entity_id') == diagram_id:
            matched = it
            break
    assert matched is not None

    detail = json.loads(matched.get('detail') or '{}')
    assert 'changes' in detail
    assert detail.get('changed_fields', 0) >= 1
