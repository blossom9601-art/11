def test_hw_frame_frontbay_crud(client):
    scope_key = 'hw_server_frame_frontbay'
    asset_id = 123

    # Empty list
    resp = client.get('/api/hw-frame-frontbay', query_string={'scope_key': scope_key, 'asset_id': asset_id})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['items'] == []

    # Create
    create_payload = {
        'scope_key': scope_key,
        'asset_id': asset_id,
        'type': '서버',
        'space': 'BAY1',
        'model': 'DL380',
        'spec': '2CPU',
        'serial': 'ABC123',
        'vendor': 'HPE',
        'fw': '1.0.0',
        'remark': 'test',
    }
    created = client.post('/api/hw-frame-frontbay', json=create_payload)
    assert created.status_code == 201
    row = created.get_json()
    assert row['id'] > 0
    assert row['scope_key'] == scope_key
    assert row['asset_id'] == asset_id
    assert row['space'] == 'BAY1'

    # Update
    item_id = row['id']
    updated = client.put(
        f'/api/hw-frame-frontbay/{item_id}',
        json={'type': '스토리지', 'space': 'BAY2', 'model': 'VNX', 'spec': '', 'serial': '', 'vendor': '', 'fw': '', 'remark': ''},
    )
    assert updated.status_code == 200
    up = updated.get_json()
    assert up['id'] == item_id
    assert up['type'] == '스토리지'
    assert up['space'] == 'BAY2'

    # List has 1
    resp2 = client.get('/api/hw-frame-frontbay', query_string={'scope_key': scope_key, 'asset_id': asset_id})
    assert resp2.status_code == 200
    data2 = resp2.get_json()
    assert data2['total'] == 1
    assert len(data2['items']) == 1
    assert data2['items'][0]['id'] == item_id

    # Delete
    deleted = client.delete(f'/api/hw-frame-frontbay/{item_id}')
    assert deleted.status_code == 200
    assert deleted.get_json()['ok'] is True

    # List empty again
    resp3 = client.get('/api/hw-frame-frontbay', query_string={'scope_key': scope_key, 'asset_id': asset_id})
    assert resp3.status_code == 200
    assert resp3.get_json()['items'] == []
