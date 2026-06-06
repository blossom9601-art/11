def test_org_rack_list_empty(client):
    response = client.get('/api/org-racks')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_org_rack_list_center_match_multi(client):
    base = {
        'business_status_code': 'STAT_RUN',
        'business_name': '테스트 업무',
        'manufacturer_code': 'VEN_HPE',
        'rack_model': 'DL360',
        'serial_number': 'SN-TEST',
        'rack_position': 'P1',
        'system_height_u': 4,
        'system_dept_code': 'DEPT_INFRA',
        'system_manager_id': 1001,
        'service_dept_code': 'DEPT_SERVICE',
        'service_manager_id': 2001,
    }
    r1 = client.post(
        '/api/org-racks',
        json={**base, 'rack_code': 'RACK_MATCH_A', 'center_code': 'CTR_ALPHA', 'rack_position': 'A1'},
    )
    r2 = client.post(
        '/api/org-racks',
        json={**base, 'rack_code': 'RACK_MATCH_B', 'center_code': 'CTR_BETA', 'rack_position': 'B1'},
    )
    assert r1.status_code == 201 and r2.status_code == 201
    list_resp = client.get('/api/org-racks?center_match=CTR_ALPHA&center_match=CTR_BETA')
    assert list_resp.status_code == 200
    body = list_resp.get_json()
    assert body['success'] is True
    assert body['total'] == 2
    codes = sorted(item['rack_code'] for item in body['items'])
    assert codes == ['RACK_MATCH_A', 'RACK_MATCH_B']
    ids = [item['id'] for item in body['items']]
    del_resp = client.post('/api/org-racks/bulk-delete', json={'ids': ids})
    assert del_resp.status_code == 200


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
    assert item['public_id'].startswith('rack_')
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

    # bulk-delete API는 행을 물리 삭제하지 않고 is_deleted=1 로 표시한다.
    list_deleted = client.get('/api/org-racks?include_deleted=1')
    assert list_deleted.status_code == 200
    deleted_payload = list_deleted.get_json()
    assert deleted_payload['total'] == 1
    assert deleted_payload['items'][0]['is_deleted'] == 1


def test_org_rack_detail_uses_public_id_route(client):
    create_resp = client.post('/api/org-racks', json={
        'rack_code': 'RACK_ROUTE_A01',
        'business_status_code': 'STAT_RUN',
        'business_name': '라우팅 테스트 업무',
        'manufacturer_code': 'VEN_HPE',
        'rack_model': 'Standard RACK',
        'serial_number': 'SN-ROUTE-A01',
        'center_code': 'CTR_MAIN',
        'rack_position': '5F-D-1',
        'system_height_u': 42,
        'system_dept_code': 'DEPT_INFRA',
        'system_manager_id': 1001,
        'service_dept_code': 'DEPT_SERVICE',
        'service_manager_id': 2001,
    })
    assert create_resp.status_code == 201
    public_id = create_resp.get_json()['item']['public_id']

    legacy_resp = client.get('/p/dc_rack_detail_basic?rack_code=RACK_ROUTE_A01')
    assert legacy_resp.status_code == 302
    assert legacy_resp.headers['Location'].endswith(f'/b/{public_id}')

    legacy_position_resp = client.get('/p/dc_rack_detail_basic?rack_code=5F_D_1')
    assert legacy_position_resp.status_code == 302
    assert legacy_position_resp.headers['Location'].endswith(f'/b/{public_id}')

    detail_resp = client.get(
        f'/b/{public_id}',
        headers={'X-Requested-With': 'blossom-spa'},
    )
    assert detail_resp.status_code == 200
    assert f'data-rack-public-id="{public_id}"'.encode() in detail_resp.data
    assert b'dc_rack_detail_basic' in detail_resp.data
    assert b'dc_rack_detail_log' in detail_resp.data

    shell_resp = client.get(f'/b/{public_id}?tab=log')
    assert shell_resp.status_code == 200
    assert b'data-menu-code="datacenter.rack"' in shell_resp.data
    assert b'dc_rack_detail_log' in shell_resp.data

    log_resp = client.get(
        f'/b/{public_id}?tab=log',
        headers={'X-Requested-With': 'blossom-spa'},
    )
    assert log_resp.status_code == 200
