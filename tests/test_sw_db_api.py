import uuid


def _create_vendor(client, name):
    response = client.post('/api/vendor-manufacturers', json={'manufacturer_name': name})
    assert response.status_code == 201
    payload = response.get_json()
    assert payload['success'] is True
    item = payload['item']
    return item['manufacturer_code']


def _find_db_by_name(items, name):
    for item in items:
        if item.get('db_name') == name:
            return item
    return None


def test_sw_db_crud_flow(client):
    vendor_name = f'pytest-db-vendor-{uuid.uuid4().hex[:8]}'
    vendor_code = _create_vendor(client, vendor_name)

    db_name = f'pytest-db-{uuid.uuid4().hex[:8]}'
    create_payload = {
        'model': db_name,
        'hw_type': 'RDBMS',
        'manufacturer_code': vendor_code,
        'release_date': '2024-10-01',
        'eosl': '2032-12-31',
        'qty': 3,
        'note': 'initial'
    }
    create_response = client.post('/api/sw-db-types', json=create_payload)
    assert create_response.status_code == 201
    create_data = create_response.get_json()
    assert create_data['success'] is True
    db_item = create_data['item']
    db_id = db_item['id']
    assert db_item['db_name'] == db_name
    assert db_item['db_count'] == 3

    list_response = client.get('/api/sw-db-types')
    assert list_response.status_code == 200
    list_data = list_response.get_json()
    assert list_data['success'] is True
    fetched = _find_db_by_name(list_data['items'], db_name)
    assert fetched is not None
    assert fetched['db_family'] == 'RDBMS'
    assert fetched['manufacturer_code'] == vendor_code

    update_payload = {'qty': 7, 'note': 'updated'}
    update_response = client.put(f'/api/sw-db-types/{db_id}', json=update_payload)
    assert update_response.status_code == 200
    update_data = update_response.get_json()
    assert update_data['success'] is True
    assert update_data['item']['db_count'] == 7
    assert update_data['item']['remark'] == 'updated'

    delete_response = client.post('/api/sw-db-types/bulk-delete', json={'ids': [db_id]})
    assert delete_response.status_code == 200
    delete_data = delete_response.get_json()
    assert delete_data['success'] is True
    assert delete_data['deleted'] == 1

    after_delete = client.get('/api/sw-db-types')
    assert after_delete.status_code == 200
    remaining = _find_db_by_name(after_delete.get_json()['items'], db_name)
    assert remaining is None

    include_deleted = client.get('/api/sw-db-types?include_deleted=1')
    assert include_deleted.status_code == 200
    deleted_record = _find_db_by_name(include_deleted.get_json()['items'], db_name)
    assert deleted_record is not None
    assert deleted_record['is_deleted'] == 1


def test_sw_db_validation(client):
    response = client.post('/api/sw-db-types', json={'model': 'invalid'})
    assert response.status_code == 400
    data = response.get_json()
    assert data['success'] is False
    assert '필수' in data['message']
