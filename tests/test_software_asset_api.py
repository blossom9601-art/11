def test_software_asset_crud_flow(client):
    list_resp = client.get('/api/software/os/unix/assets')
    assert list_resp.status_code == 200
    data = list_resp.get_json()
    assert data['success'] is True
    assert data['total'] == 0

    payload = {
        'asset_code': 'OS-UNIX-001',
        'asset_name': '테스트 유닉스 소프트웨어',
        'sw_code': 'SW-UNIX-001',
        'work_status_code': 'ACTIVE',
        'work_group_code': 'OPS',
        'work_name': '테스트업무',
        'manufacturer_code': None,
        'system_dept_code': None,
        'service_dept_code': None,
        'license_method': '서브스크립션(1년)',
        'license_unit': '서버',
        'license_total_count': 10,
        'license_assign_count': 3,
        'license_note': '테스트 용도',
    }

    create_resp = client.post('/api/software/os/unix/assets', json=payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['asset_code'] == 'OS-UNIX-001'
    assert item['license_available_count'] == 7
    asset_id = item['id']

    list_resp = client.get('/api/software/os/unix/assets')
    assert list_resp.status_code == 200
    data = list_resp.get_json()
    assert data['total'] == 1
    assert data['items'][0]['asset_name'] == '테스트 유닉스 소프트웨어'

    detail_resp = client.get(f'/api/software/os/unix/assets/{asset_id}')
    assert detail_resp.status_code == 200
    detail = detail_resp.get_json()
    assert detail['item']['sw_code'] == 'SW-UNIX-001'

    update_resp = client.put(
        f'/api/software/os/unix/assets/{asset_id}',
        json={'license_assign_count': 8, 'license_unit': 'CPU'}
    )
    assert update_resp.status_code == 200
    updated = update_resp.get_json()['item']
    assert updated['license_assign_count'] == 8
    assert updated['license_available_count'] == 2
    assert updated['license_unit'] == 'CPU'

    delete_resp = client.post(
        '/api/software/os/unix/assets/bulk-delete',
        json={'ids': [asset_id]}
    )
    assert delete_resp.status_code == 200
    delete_data = delete_resp.get_json()
    assert delete_data['success'] is True
    assert delete_data['deleted'] == 1

    final_list = client.get('/api/software/os/unix/assets')
    assert final_list.status_code == 200
    assert final_list.get_json()['total'] == 0
