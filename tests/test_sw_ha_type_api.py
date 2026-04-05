import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def ha_vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': '고가용성제조사'}, 'pytest', app)
        return record['manufacturer_code']


def test_sw_ha_type_list_empty(client):
    response = client.get('/api/sw-ha-types')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_sw_ha_type_crud_flow(client, ha_vendor_code):
    create_payload = {
        'model': 'PyTest HA Suite',
        'vendor_code': ha_vendor_code,
        'hw_type': 'Active-Active',
        'release_date': '2023-01-01',
        'eosl': '2026-01-01',
        'qty': 3,
        'note': 'pytest ha record'
    }
    create_resp = client.post('/api/sw-ha-types', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['ha_name'] == 'PyTest HA Suite'
    assert item['manufacturer_code'] == ha_vendor_code
    assert item['ha_mode'] == 'Active-Active'
    ha_id = item['id']

    update_resp = client.put(f'/api/sw-ha-types/{ha_id}', json={'qty': 7, 'note': 'updated via test'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['qty'] == 7
    assert updated['item']['note'] == 'updated via test'

    list_resp = client.get('/api/sw-ha-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 7

    delete_resp = client.post('/api/sw-ha-types/bulk-delete', json={'ids': [ha_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/sw-ha-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/sw-ha-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
