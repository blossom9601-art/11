def test_server_software_tab02_crud_flow(client):
    hardware_id = 123

    list_resp = client.get(f'/api/hardware/assets/{hardware_id}/software')
    assert list_resp.status_code == 200
    data = list_resp.get_json()
    assert data['success'] is True
    assert data['total'] == 0

    payload = {
        'type': '운영체제',
        'name': 'Rocky Linux',
        'version': '9.3',
        'vendor': 'Rocky',
        'qty': 1,
        'license_key': 'N/A',
        'serial': 'SW-SN-001',
        'maintenance': '테스트',
    }

    create_resp = client.post(f'/api/hardware/assets/{hardware_id}/software', json=payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['hardware_id'] == hardware_id
    assert item['type'] == '운영체제'
    assert item['name'] == 'Rocky Linux'
    assert item['serial'] == 'SW-SN-001'
    assert item['maintenance'] == '테스트'
    sw_id = item['id']

    update_resp = client.put(
        f'/api/hardware/assets/{hardware_id}/software/{sw_id}',
        json={'qty': 3, 'serial': 'SW-SN-002', 'maintenance': '업데이트'}
    )
    assert update_resp.status_code == 200
    updated = update_resp.get_json()['item']
    assert updated['qty'] == 3
    assert updated['serial'] == 'SW-SN-002'
    assert updated['maintenance'] == '업데이트'

    list_resp2 = client.get(f'/api/hardware/assets/{hardware_id}/software')
    assert list_resp2.status_code == 200
    data2 = list_resp2.get_json()
    assert data2['total'] == 1
    assert data2['items'][0]['id'] == sw_id

    delete_resp = client.delete(f'/api/hardware/assets/{hardware_id}/software/{sw_id}')
    assert delete_resp.status_code == 200
    deleted = delete_resp.get_json()
    assert deleted['success'] is True
    assert deleted['deleted'] == 1

    final_list = client.get(f'/api/hardware/assets/{hardware_id}/software')
    assert final_list.status_code == 200
    assert final_list.get_json()['total'] == 0
