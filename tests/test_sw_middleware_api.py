import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def vendor_code(app):
    with app.app_context():
        record = create_vendor({'manufacturer_name': '테스트제조사'}, 'pytest', app)
        return record['manufacturer_code']


def test_sw_middleware_list_empty(client):
    response = client.get('/api/sw-middleware-types')
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert data['items'] == []
    assert data['total'] == 0


def test_sw_middleware_crud_flow(client, vendor_code):
    create_payload = {
        'model': 'PyTest Middleware',
        'vendor_code': vendor_code,
        'hw_type': 'WEB',
        'release_date': '2024-01-01',
        'eosl': '2026-12-31',
        'qty': 3,
        'note': 'created via api test'
    }
    create_resp = client.post('/api/sw-middleware-types', json=create_payload)
    assert create_resp.status_code == 201
    create_data = create_resp.get_json()
    assert create_data['success'] is True
    item = create_data['item']
    assert item['model_name'] == 'PyTest Middleware'
    assert item['manufacturer_code'] == vendor_code
    assert item['hw_type'] == 'WEB'
    mw_id = item['id']

    update_resp = client.put(f'/api/sw-middleware-types/{mw_id}', json={'qty': 5, 'remark': 'updated via test'})
    assert update_resp.status_code == 200
    update_data = update_resp.get_json()
    assert update_data['item']['qty'] == 5
    assert update_data['item']['remark'] == 'updated via test'

    list_resp = client.get('/api/sw-middleware-types')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['qty'] == 5

    delete_resp = client.post('/api/sw-middleware-types/bulk-delete', json={'ids': [mw_id]})
    assert delete_resp.status_code == 200
    delete_data = delete_resp.get_json()
    assert delete_data['success'] is True
    assert delete_data['deleted'] == 1

    # default list hides deleted rows
    list_after = client.get('/api/sw-middleware-types')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    # include deleted flag should surface soft-deleted rows
    list_deleted = client.get('/api/sw-middleware-types?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1
