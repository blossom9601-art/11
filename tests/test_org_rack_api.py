def test_org_rack_list_empty(client):
    response = client.get('/api/org-racks')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_org_rack_crud_flow(client):
    create_payload = {
        'rack_code': 'RACK_FC_A01',
        'business_status_code': 'STAT_RUN',
        'business_name': '퓨처센터 업무',
        'manufacturer_code': 'VEN_HPE',
        'rack_model': 'DL360 Gen10',
        'serial_number': 'SN-FC-A01',
        'center_code': 'CTR_MAIN',
        'rack_position': 'FC5F-A01',
        'system_height_u': 4,
        'system_dept_code': 'DEPT_INFRA',
        'system_manager_id': 1001,
        'service_dept_code': 'DEPT_SERVICE',
        'service_manager_id': 2001,
        'remark': '주요 업무 랙',
    }
    create_resp = client.post('/api/org-racks', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['rack_code'] == 'RACK_FC_A01'
    assert item['rack_position'] == 'FC5F-A01'
    assert item['rack_model'] == 'DL360 Gen10'
    assert item['system_height_u'] == 4
    rack_id = item['id']

    update_resp = client.put(
        f'/api/org-racks/{rack_id}',
        json={'system_height_u': 6, 'remark': '확장 완료', 'rack_position': 'FC5F-A02'}
    )
    assert update_resp.status_code == 200
    updated = update_resp.get_json()['item']
    assert updated['system_height_u'] == 6
    assert updated['remark'] == '확장 완료'
    assert updated['rack_position'] == 'FC5F-A02'

    list_resp = client.get('/api/org-racks')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['rack_position'] == 'FC5F-A02'

    delete_resp = client.post('/api/org-racks/bulk-delete', json={'ids': [rack_id]})
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    list_after = client.get('/api/org-racks')
    assert list_after.status_code == 200
    assert list_after.get_json()['total'] == 0

    # hard delete: record should be completely gone even with include_deleted
    list_deleted = client.get('/api/org-racks?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 0
