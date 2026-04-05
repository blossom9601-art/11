def test_access_entry_register_list_empty(client):
    response = client.get('/api/datacenter/access/entries')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_access_entry_register_crud_flow(client):
    create_payload = {
        'status': '입실',
        'name': '홍길동',
        'affiliation': '인프라팀',
        'id_number': 'A-100',
        'entry_datetime': '2024-01-01 09:00',
        'entry_purpose': '장비 점검',
        'entry_area': '퓨처센터 5층',
        'laptop_use': 'O',
        'usb_lock_use': 'X',
        'manager_in_charge': '김관리',
        'access_admin': '박보안',
        'in_out_type': '반입',
        'goods_type': '장비',
        'goods_item': '서버',
        'goods_qty': 2,
        'note': '테스트 생성',
    }
    create_resp = client.post('/api/datacenter/access/entries', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['status'] == '입실'
    entry_id = item['id']

    list_resp = client.get('/api/datacenter/access/entries')
    assert list_resp.status_code == 200
    assert list_resp.get_json()['total'] == 1

    detail_resp = client.get(f'/api/datacenter/access/entries/{entry_id}')
    assert detail_resp.status_code == 200
    assert detail_resp.get_json()['item']['name'] == '홍길동'

    update_payload = {
        'status': '퇴실',
        'exit_datetime': '2024-01-01 18:00',
        'note': '퇴실 완료',
    }
    update_resp = client.put(f'/api/datacenter/access/entries/{entry_id}', json=update_payload)
    assert update_resp.status_code == 200
    updated_item = update_resp.get_json()['item']
    assert updated_item['status'] == '퇴실'
    assert updated_item['exit_datetime'] == '2024-01-01 18:00'

    record_list = client.get('/api/datacenter/access/records')
    assert record_list.status_code == 200
    record_payload = record_list.get_json()
    assert record_payload['total'] == 1
    assert record_payload['items'][0]['status'] == '퇴실'

    register_list = client.get('/api/datacenter/access/entries')
    assert register_list.status_code == 200
    assert register_list.get_json()['total'] == 0

    delete_resp = client.delete(f'/api/datacenter/access/entries/{entry_id}')
    assert delete_resp.status_code == 200
    assert delete_resp.get_json()['deleted'] == 1

    final_records = client.get('/api/datacenter/access/records')
    assert final_records.get_json()['total'] == 0

    second_resp = client.post('/api/datacenter/access/entries', json={
        'status': '입실',
        'name': '이서버',
        'entry_area': '재해복구센터',
        'entry_datetime': '2024-02-02 10:00',
    })
    assert second_resp.status_code == 201
    second = second_resp.get_json()['item']['id']

    third_resp = client.post('/api/datacenter/access/entries', json={
        'status': '대기',
        'name': '박보안',
        'entry_area': '을지타워',
        'entry_datetime': '2024-02-02 11:00',
    })
    assert third_resp.status_code == 201
    third = third_resp.get_json()['item']['id']

    bulk_resp = client.post('/api/datacenter/access/entries/bulk-delete', json={'ids': [second, third]})
    assert bulk_resp.status_code == 200
    bulk_payload = bulk_resp.get_json()
    assert bulk_payload['success'] is True
    assert bulk_payload['deleted'] == 2

    all_list = client.get('/api/datacenter/access/entries?view=all')
    assert all_list.status_code == 200
    assert all_list.get_json()['total'] == 0
