import uuid


def _create_vendor(client, name):
    response = client.post('/api/vendor-manufacturers', json={'manufacturer_name': name})
    assert response.status_code == 201
    payload = response.get_json()
    assert payload['success'] is True
    item = payload['item']
    return item['manufacturer_code']


def _find_os_by_model(items, model_name):
    for item in items:
        if item.get('model_name') == model_name:
            return item
    return None


def test_sw_os_crud_flow(client):
    vendor_name = f'pytest-vendor-{uuid.uuid4().hex[:8]}'
    vendor_code = _create_vendor(client, vendor_name)

    model_name = f'pytest-os-{uuid.uuid4().hex[:8]}'
    create_payload = {
        'model': model_name,
        'hw_type': '리눅스',
        'manufacturer_code': vendor_code,
        'release_date': '2024-11-01',
        'eosl': '2030-12-31',
        'qty': 5,
        'note': 'initial'
    }
    create_response = client.post('/api/sw-os-types', json=create_payload)
    assert create_response.status_code == 201
    create_data = create_response.get_json()
    assert create_data['success'] is True
    os_item = create_data['item']
    os_id = os_item['id']
    assert os_item['model_name'] == model_name
    assert os_item['license_count'] == 5

    list_response = client.get('/api/sw-os-types')
    assert list_response.status_code == 200
    list_data = list_response.get_json()
    assert list_data['success'] is True
    fetched = _find_os_by_model(list_data['items'], model_name)
    assert fetched is not None
    assert fetched['os_type'] == '리눅스'
    assert fetched['manufacturer_code'] == vendor_code

    update_payload = {'qty': 9, 'note': 'updated'}
    update_response = client.put(f'/api/sw-os-types/{os_id}', json=update_payload)
    assert update_response.status_code == 200
    update_data = update_response.get_json()
    assert update_data['success'] is True
    assert update_data['item']['license_count'] == 9
    assert update_data['item']['remark'] == 'updated'

    delete_response = client.post('/api/sw-os-types/bulk-delete', json={'ids': [os_id]})
    assert delete_response.status_code == 200
    delete_data = delete_response.get_json()
    assert delete_data['success'] is True
    assert delete_data['deleted'] == 1

    after_delete = client.get('/api/sw-os-types')
    assert after_delete.status_code == 200
    remaining = _find_os_by_model(after_delete.get_json()['items'], model_name)
    assert remaining is None

    include_deleted = client.get('/api/sw-os-types?include_deleted=1')
    assert include_deleted.status_code == 200
    deleted_record = _find_os_by_model(include_deleted.get_json()['items'], model_name)
    assert deleted_record is not None
    assert deleted_record['is_deleted'] == 1


def test_sw_os_validation(client):
    response = client.post('/api/sw-os-types', json={'model': 'invalid'})
    assert response.status_code == 400
    data = response.get_json()
    assert data['success'] is False
    assert '필수' in data['message']
