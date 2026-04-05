import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def cpu_vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': 'CPU Maker'}, 'pytest', app)
        return record['manufacturer_code']


def test_cmp_cpu_type_list_empty(client):
    response = client.get('/api/cmp-cpu-types')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_cmp_cpu_type_crud_flow(client, cpu_vendor_code):
    create_payload = {
        'model': 'Xeon Gold 6348',
        'vendor_code': cpu_vendor_code,
        'spec': '28C 2.6GHz 205W',
        'part_no': 'BX80713-6348',
        'qty': 4,
        'note': 'Ice Lake-SP'
    }
    create_resp = client.post('/api/cmp-cpu-types', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['model_name'] == 'Xeon Gold 6348'
    assert item['manufacturer_code'] == cpu_vendor_code
    assert item['part_number'] == 'BX80713-6348'
    cpu_id = item['id']

    update_resp = client.put(f'/api/cmp-cpu-types/{cpu_id}', json={'qty': 6, 'note': 'Updated remark'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['qty'] == 6
    assert updated['item']['note'] == 'Updated remark'

    list_resp = client.get('/api/cmp-cpu-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 6

    delete_resp = client.post('/api/cmp-cpu-types/bulk-delete', json={'ids': [cpu_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/cmp-cpu-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/cmp-cpu-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1


def test_cmp_cpu_type_update_records_change_event(client, cpu_vendor_code):
    """PUT /api/cmp-cpu-types/<id> 호출 시 변경이력(ChangeEvent)이 기록되는지 검증."""
    create_resp = client.post('/api/cmp-cpu-types', json={
        'model': 'Xeon Gold 6348',
        'vendor_code': cpu_vendor_code,
        'spec': '28C 2.6GHz',
        'part_no': 'BX80713-6348',
        'qty': 2,
        'note': 'original',
    })
    assert create_resp.status_code == 201
    cpu_id = create_resp.get_json()['item']['id']

    # Update a field that should trigger a change event
    update_resp = client.put(f'/api/cmp-cpu-types/{cpu_id}', json={
        'spec': '28C 2.6GHz 205W',
        'note': 'updated remark',
    })
    assert update_resp.status_code == 200

    # Query change events for this entity
    ce_resp = client.get(f'/api/change-events?entity_type=cmp_cpu_type&entity_id={cpu_id}')
    assert ce_resp.status_code == 200
    ce_data = ce_resp.get_json()
    assert ce_data['success'] is True
    assert ce_data['total'] >= 1, f'Expected at least one change event after CPU update, got: {ce_data}'

    event = ce_data['events'][0]
    assert event['entity_type'] == 'cmp_cpu_type'
    assert event['entity_id'] == str(cpu_id)
    assert event['action_type'] == 'UPDATE'
    assert event['title'] == 'Xeon Gold 6348'
