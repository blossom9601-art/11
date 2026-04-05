def _create_policy(client):
    payload = {
        'status': 'ACTIVE',
        'start_ip': '192.168.0.1',
        'end_ip': '192.168.0.10',
        'role': 'MGMT',
    }
    resp = client.post('/api/network/ip-policies', json=payload)
    assert resp.status_code == 201
    return resp.get_json()['item']['id']


def test_network_ip_diagram_list_empty_requires_policy(client, authed_client):
    missing_resp = client.get('/api/network/ip-diagrams')
    assert missing_resp.status_code == 400

    policy_id = _create_policy(authed_client)
    resp = client.get(f'/api/network/ip-diagrams?policy_id={policy_id}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['items'] == []
    assert data['total'] == 0


def test_network_ip_diagram_invalid_policy_rejected(authed_client):
    resp = authed_client.post(
        '/api/network/ip-diagrams',
        json={'policy_id': 9999, 'file_name': 'ghost.png'},
    )
    assert resp.status_code == 400
    payload = resp.get_json()
    assert payload['success'] is False


def test_network_ip_diagram_crud_flow(authed_client):
    policy_id = _create_policy(authed_client)

    create_payload = {
        'policy_id': policy_id,
        'entry_type': 'diagram',
        'file_name': 'layout.png',
        'file_path': '/tmp/layout.png',
        'file_size': 2048,
        'description': 'Primary diagram',
        'is_primary': True,
    }
    create_resp = authed_client.post('/api/network/ip-diagrams', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()['item']
    assert created['entry_type'] == 'DIAGRAM'
    assert created['is_primary'] is True
    diagram_id = created['id']

    list_resp = authed_client.get(f'/api/network/ip-diagrams?policy_id={policy_id}')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1

    detail_resp = authed_client.get(f'/api/network/ip-diagrams/{diagram_id}')
    assert detail_resp.status_code == 200
    assert detail_resp.get_json()['item']['id'] == diagram_id

    update_resp = authed_client.put(
        f'/api/network/ip-diagrams/{diagram_id}',
        json={'description': 'Updated diagram'},
    )
    assert update_resp.status_code == 200
    assert update_resp.get_json()['item']['description'] == 'Updated diagram'

    attachment_payload = {
        'policy_id': policy_id,
        'entry_type': 'attachment',
        'file_name': 'manual.pdf',
        'file_size': 5120,
        'kind': 'Manual',
    }
    att_resp = authed_client.post('/api/network/ip-diagrams', json=attachment_payload)
    assert att_resp.status_code == 201
    attachment_id = att_resp.get_json()['item']['id']

    filtered = authed_client.get(f'/api/network/ip-diagrams?policy_id={policy_id}&type=attachment')
    assert filtered.status_code == 200
    assert filtered.get_json()['total'] == 1

    delete_resp = authed_client.delete(f'/api/network/ip-diagrams/{diagram_id}')
    assert delete_resp.status_code == 200
    assert delete_resp.get_json()['deleted'] == 1

    bulk_resp = authed_client.post(
        '/api/network/ip-diagrams/bulk-delete',
        json={'ids': [attachment_id]},
    )
    assert bulk_resp.status_code == 200
    assert bulk_resp.get_json()['deleted'] == 1

    final_resp = authed_client.get(f'/api/network/ip-diagrams?policy_id={policy_id}')
    assert final_resp.status_code == 200
    assert final_resp.get_json()['total'] == 0
