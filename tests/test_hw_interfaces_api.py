def test_hw_interfaces_create_and_list(client):
    scope_key = 'hw_server_onpremise_if'
    asset_id = 12345

    payload = {
        'scope_key': scope_key,
        'asset_id': asset_id,
        'slot': 'S1',
        'port': 'P1',
        'iface': 'eth0',
        'serial': 'UUID-1',
        'assign': '10.0.0.1',
        'peer': 'PEER_WORK',
        'peer_port': 'ge-0/0/1',
        'remark': 'memo',
    }

    r = client.post('/api/hw-interfaces', json=payload)
    assert r.status_code == 201
    created = r.get_json()
    assert created['scope_key'] == scope_key
    assert created['asset_id'] == asset_id
    assert created['port'] == 'P1'

    r2 = client.get(
        '/api/hw-interfaces',
        query_string={'scope_key': scope_key, 'asset_id': asset_id, 'page': 1, 'page_size': 50},
    )
    assert r2.status_code == 200
    data = r2.get_json()
    assert data['total'] >= 1
    assert any(item['id'] == created['id'] for item in data['items'])
