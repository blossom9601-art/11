import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def disk_vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': 'Disk Maker'}, 'pytest', app)
        return record['manufacturer_code']


def test_cmp_disk_type_list_empty(client):
    response = client.get('/api/cmp-disk-types')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_cmp_disk_type_crud_flow(client, disk_vendor_code):
    create_payload = {
        'model': 'PM9A3 3.84TB U.2 NVMe',
        'vendor_code': disk_vendor_code,
        'spec': 'U.2 NVMe, PCIe 4.0 x4, 3.84TB',
        'part_no': 'MZQL23T8HCLS-00A07',
        'qty': 8,
        'note': 'Test Disk',
    }
    create_resp = client.post('/api/cmp-disk-types', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['model_name'] == 'PM9A3 3.84TB U.2 NVMe'
    assert item['manufacturer_code'] == disk_vendor_code
    assert item['part_number'] == 'MZQL23T8HCLS-00A07'
    disk_id = item['id']

    update_resp = client.put(f'/api/cmp-disk-types/{disk_id}', json={'qty': 12, 'note': 'Updated Disk'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['qty'] == 12
    assert updated['item']['note'] == 'Updated Disk'

    list_resp = client.get('/api/cmp-disk-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 12

    delete_resp = client.post('/api/cmp-disk-types/bulk-delete', json={'ids': [disk_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/cmp-disk-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/cmp-disk-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
