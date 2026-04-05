def test_org_thermometer_list_empty(client):
    response = client.get('/api/org-thermometers')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_org_thermometer_bulk_update_persists(client):
    create_payload_1 = {
        'business_status': 'STATUS_1',
        'business_name': '온습도-A',
        'vendor': 'VendorA',
        'model': 'ModelA',
        'serial': 'SNA',
        'place': '센터A',
        'system_owner_dept': '',
        'system_owner': '',
        'service_owner_dept': '',
        'service_owner': '',
    }
    create_payload_2 = {
        'business_status': 'STATUS_1',
        'business_name': '온습도-B',
        'vendor': 'VendorB',
        'model': 'ModelB',
        'serial': 'SNB',
        'place': '센터A',
        'system_owner_dept': '',
        'system_owner': '',
        'service_owner_dept': '',
        'service_owner': '',
    }

    r1 = client.post('/api/org-thermometers', json=create_payload_1)
    assert r1.status_code == 201
    id1 = r1.get_json()['item']['id']

    r2 = client.post('/api/org-thermometers', json=create_payload_2)
    assert r2.status_code == 201
    id2 = r2.get_json()['item']['id']

    bulk = client.post(
        '/api/org-thermometers/bulk-update',
        json={'ids': [id1, id2], 'updates': {'business_status': 'STATUS_9', 'place': '센터B'}},
    )
    assert bulk.status_code == 200
    payload = bulk.get_json()
    assert payload['success'] is True
    assert payload['updated'] == 2

    listed = client.get('/api/org-thermometers').get_json()['items']
    by_id = {row['id']: row for row in listed}
    assert by_id[id1]['business_status'] == 'STATUS_9'
    assert by_id[id2]['business_status'] == 'STATUS_9'
    assert by_id[id1]['place'] == '센터B'
    assert by_id[id2]['place'] == '센터B'
