import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': '보안SW제조사'}, 'pytest', app)
        return record['manufacturer_code']


def test_sw_security_type_list_empty(client):
    response = client.get('/api/sw-security-types')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_sw_security_type_crud_flow(client, vendor_code):
    create_payload = {
        'model': 'PyTest Security Suite',
        'vendor_code': vendor_code,
        'hw_type': '백신',
        'release_date': '2024-03-01',
        'eosl': '2027-03-01',
        'qty': 15,
        'note': 'security record via test'
    }
    create_resp = client.post('/api/sw-security-types', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['secsw_name'] == 'PyTest Security Suite'
    assert item['manufacturer_code'] == vendor_code
    assert item['secsw_family'] == '백신'
    security_id = item['id']

    update_resp = client.put(f'/api/sw-security-types/{security_id}', json={'qty': 20, 'note': 'patched via test'})
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['qty'] == 20
    assert updated['item']['note'] == 'patched via test'

    list_resp = client.get('/api/sw-security-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 20

    delete_resp = client.post('/api/sw-security-types/bulk-delete', json={'ids': [security_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/sw-security-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    list_deleted = client.get('/api/sw-security-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
