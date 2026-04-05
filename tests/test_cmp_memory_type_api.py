import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def memory_vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': 'Memory Maker'}, 'pytest', app)
        return record['manufacturer_code']


def test_cmp_memory_type_list_empty(client):
    response = client.get('/api/cmp-memory-types')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_cmp_memory_type_crud_flow(client, memory_vendor_code):
    create_payload = {
        'model': 'Samsung DDR5 32GB RDIMM 4800',
        'vendor_code': memory_vendor_code,
        'spec': 'DDR5 RDIMM 32GB 4800MT/s ECC 2Rx8',
        'part_no': 'M321R4GA3BB0-CQKQ',
        'qty': 16,
        'note': 'Test Memory'
    }
    create_resp = client.post('/api/cmp-memory-types', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['model_name'] == 'Samsung DDR5 32GB RDIMM 4800'
    assert item['manufacturer_code'] == memory_vendor_code
    assert item['part_number'] == 'M321R4GA3BB0-CQKQ'
    memory_id = item['id']

    update_resp = client.put(f'/api/cmp-memory-types/{memory_id}', json={'qty': 32, 'note': 'Updated Memory'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['qty'] == 32
    assert updated['item']['note'] == 'Updated Memory'

    list_resp = client.get('/api/cmp-memory-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 32

    delete_resp = client.post('/api/cmp-memory-types/bulk-delete', json={'ids': [memory_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/cmp-memory-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/cmp-memory-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
