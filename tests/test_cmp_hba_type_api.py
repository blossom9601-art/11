import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def hba_vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': 'HBA Maker'}, 'pytest', app)
        return record['manufacturer_code']


def test_cmp_hba_type_list_empty(client):
    response = client.get('/api/cmp-hba-types')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_cmp_hba_type_crud_flow(client, hba_vendor_code):
    create_payload = {
        'model': 'Broadcom LPe35002-M2',
        'vendor_code': hba_vendor_code,
        'spec': '32Gb FC, Dual Port, PCIe 4.0 x8',
        'part_no': 'LPe35002-M2',
        'qty': 5,
        'note': 'Dual-port HBA',
    }
    create_resp = client.post('/api/cmp-hba-types', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['model_name'] == 'Broadcom LPe35002-M2'
    assert item['manufacturer_code'] == hba_vendor_code
    assert item['part_number'] == 'LPe35002-M2'
    hba_id = item['id']

    update_resp = client.put(f'/api/cmp-hba-types/{hba_id}', json={'qty': 10, 'note': 'Updated HBA'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['qty'] == 10
    assert updated['item']['note'] == 'Updated HBA'

    list_resp = client.get('/api/cmp-hba-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 10

    delete_resp = client.post('/api/cmp-hba-types/bulk-delete', json={'ids': [hba_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/cmp-hba-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/cmp-hba-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
