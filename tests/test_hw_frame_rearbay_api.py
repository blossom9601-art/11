def test_hw_frame_rearbay_crud(client):
    scope_key = 'hw_server_frame_rearbay'
    asset_id = 456

    # Empty list
    resp = client.get('/api/hw-frame-rearbay', query_string={'scope_key': scope_key, 'asset_id': asset_id})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['items'] == []

    # Create
    create_payload = {
        'scope_key': scope_key,
        'asset_id': asset_id,
        'type': 'SAN',
        'space': 'BAY1',
        'model': 'DS8K',
        'spec': 'FC',
        'serial': 'R123',
        'vendor': 'IBM',
        'fw': '0.0.1',
        'remark': 'test',
    }
    created = client.post('/api/hw-frame-rearbay', json=create_payload)
    assert created.status_code == 201
    row = created.get_json()
    assert row['id'] > 0
    assert row['scope_key'] == scope_key
    assert row['asset_id'] == asset_id
    assert row['space'] == 'BAY1'

    # Update
    item_id = row['id']
    updated = client.put(
        f'/api/hw-frame-rearbay/{item_id}',
        json={'type': '네트워크', 'space': 'BAY2', 'model': 'SW', 'spec': '', 'serial': '', 'vendor': '', 'fw': '', 'remark': ''},
    )
    assert updated.status_code == 200
    up = updated.get_json()
    assert up['id'] == item_id
    assert up['type'] == '네트워크'
    assert up['space'] == 'BAY2'

    # List has 1
    resp2 = client.get('/api/hw-frame-rearbay', query_string={'scope_key': scope_key, 'asset_id': asset_id})
    assert resp2.status_code == 200
    data2 = resp2.get_json()
    assert data2['total'] == 1
    assert len(data2['items']) == 1
    assert data2['items'][0]['id'] == item_id

    # Delete
    deleted = client.delete(f'/api/hw-frame-rearbay/{item_id}')
    assert deleted.status_code == 200
    assert deleted.get_json()['ok'] is True

    # List empty again
    resp3 = client.get('/api/hw-frame-rearbay', query_string={'scope_key': scope_key, 'asset_id': asset_id})
    assert resp3.status_code == 200
    assert resp3.get_json()['items'] == []
