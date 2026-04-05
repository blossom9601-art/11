import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def nic_vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': 'NIC Maker'}, 'pytest', app)
        return record['manufacturer_code']


def test_cmp_nic_type_list_empty(client):
    response = client.get('/api/cmp-nic-types')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_cmp_nic_type_crud_flow(client, nic_vendor_code):
    create_payload = {
        'model': 'ConnectX-6 Dx 100GbE',
        'vendor_code': nic_vendor_code,
        'spec': 'Dual QSFP28, PCIe 4.0 x16, 100GbE',
        'part_no': 'MCX623106AN-CDAT',
        'qty': 4,
        'note': 'Dual-port NIC',
    }
    create_resp = client.post('/api/cmp-nic-types', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['model_name'] == 'ConnectX-6 Dx 100GbE'
    assert item['manufacturer_code'] == nic_vendor_code
    assert item['part_number'] == 'MCX623106AN-CDAT'
    nic_id = item['id']

    update_resp = client.put(f'/api/cmp-nic-types/{nic_id}', json={'qty': 9, 'note': 'Updated NIC'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['qty'] == 9
    assert updated['item']['note'] == 'Updated NIC'

    list_resp = client.get('/api/cmp-nic-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 9

    delete_resp = client.post('/api/cmp-nic-types/bulk-delete', json={'ids': [nic_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/cmp-nic-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/cmp-nic-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
