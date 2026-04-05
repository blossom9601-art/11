import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def gpu_vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': 'GPU Maker'}, 'pytest', app)
        return record['manufacturer_code']


def test_cmp_gpu_type_list_empty(client):
    response = client.get('/api/cmp-gpu-types')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_cmp_gpu_type_crud_flow(client, gpu_vendor_code):
    create_payload = {
        'model': 'NVIDIA H100 SXM',
        'vendor_code': gpu_vendor_code,
        'spec': 'Hopper, SXM5, 80GB HBM3, 700W',
        'part_no': '900-23501-0000-000',
        'qty': 8,
        'note': 'Test GPU'
    }
    create_resp = client.post('/api/cmp-gpu-types', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['model_name'] == 'NVIDIA H100 SXM'
    assert item['manufacturer_code'] == gpu_vendor_code
    assert item['part_number'] == '900-23501-0000-000'
    gpu_id = item['id']

    update_resp = client.put(f'/api/cmp-gpu-types/{gpu_id}', json={'qty': 10, 'note': 'Updated GPU'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['qty'] == 10
    assert updated['item']['note'] == 'Updated GPU'

    list_resp = client.get('/api/cmp-gpu-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 10

    delete_resp = client.post('/api/cmp-gpu-types/bulk-delete', json={'ids': [gpu_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/cmp-gpu-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/cmp-gpu-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
