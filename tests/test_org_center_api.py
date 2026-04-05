def test_org_center_list_empty(client):
    response = client.get('/api/org-centers')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_org_center_crud_flow(client):
    create_payload = {
        'center_name': '상암 데이터센터',
        'location': '서울 마포구',
        'usage': '본사 DC',
        'seismic': 7.0,
        'rack_qty': 120,
        'hw_qty': 900,
        'sw_qty': 450,
        'line_qty': 6,
        'note': '주 센터',
    }
    create_resp = client.post('/api/org-centers', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['center_name'] == '상암 데이터센터'
    assert item['location'] == '서울 마포구'
    assert item['usage'] == '본사 DC'
    assert item['rack_qty'] == 120
    assert item['hw_qty'] == 900
    assert item['line_qty'] == 6
    assert item['center_code']  # auto-generated code must exist
    center_id = item['id']

    update_resp = client.put(f'/api/org-centers/{center_id}', json={'rack_qty': 150, 'note': '업데이트'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['rack_qty'] == 150
    assert updated['item']['note'] == '업데이트'

    list_resp = client.get('/api/org-centers')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    # rack_qty/hw_qty are now dynamically computed from actual asset data;
    # in the test DB there are no racks/hardware, so they return 0.
    assert isinstance(listed['items'][0]['rack_qty'], int)
    assert isinstance(listed['items'][0]['hw_qty'], int)

    delete_resp = client.post('/api/org-centers/bulk-delete', json={'ids': [center_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/org-centers')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/org-centers?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
