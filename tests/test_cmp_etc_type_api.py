import pytest

from app.services.vendor_manufacturer_service import create_vendor


@pytest.fixture
def etc_vendor_code(app):
	with app.app_context():
		record = create_vendor({'manufacturer_name': 'ETC Maker'}, 'pytest', app)
		return record['manufacturer_code']


def test_cmp_etc_type_list_empty(client):
	response = client.get('/api/cmp-etc-types')
	assert response.status_code == 200
	payload = response.get_json()
	assert payload['success'] is True
	assert payload['items'] == []
	assert payload['total'] == 0


def test_cmp_etc_type_crud_flow(client, etc_vendor_code):
	create_payload = {
		'model': 'HPE TPM 2.0 Kit',
		'vendor_code': etc_vendor_code,
		'spec': 'TPM 2.0 보안 모듈',
		'part_no': 'P01366-B21',
		'qty': 7,
		'note': 'Gen10 전용',
	}
	create_resp = client.post('/api/cmp-etc-types', json=create_payload)
	assert create_resp.status_code == 201
	created = create_resp.get_json()
	assert created['success'] is True
	item = created['item']
	assert item['model_name'] == 'HPE TPM 2.0 Kit'
	assert item['manufacturer_code'] == etc_vendor_code
	assert item['part_number'] == 'P01366-B21'
	etc_id = item['id']

	update_resp = client.put(f'/api/cmp-etc-types/{etc_id}', json={'qty': 12, 'note': 'Updated ETC'})
	assert update_resp.status_code == 200
	updated = update_resp.get_json()
	assert updated['item']['qty'] == 12
	assert updated['item']['note'] == 'Updated ETC'

	list_resp = client.get('/api/cmp-etc-types')
	assert list_resp.status_code == 200
	listed = list_resp.get_json()
	assert listed['total'] == 1
	assert listed['items'][0]['qty'] == 12

	delete_resp = client.post('/api/cmp-etc-types/bulk-delete', json={'ids': [etc_id]})
	assert delete_resp.status_code == 200
	delete_payload = delete_resp.get_json()
	assert delete_payload['success'] is True
	assert delete_payload['deleted'] == 1

	list_after = client.get('/api/cmp-etc-types')
	assert list_after.status_code == 200
	assert list_after.get_json()['total'] == 0

	list_deleted = client.get('/api/cmp-etc-types?include_deleted=1')
	assert list_deleted.status_code == 200
	deleted_payload = list_deleted.get_json()
	assert deleted_payload['total'] == 1
	assert deleted_payload['items'][0]['is_deleted'] == 1
