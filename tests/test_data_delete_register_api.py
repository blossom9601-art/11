from app.models import db, UserProfile


def _seed_profiles(app):
    with app.app_context():
        creator = UserProfile(emp_no='EMP-900', name='Creator Tester')
        worker = UserProfile(emp_no='EMP-901', name='Worker Tester')
        requester = UserProfile(emp_no='EMP-902', name='Requester Tester')
        db.session.add_all([creator, worker, requester])
        db.session.commit()
        return {
            'creator_emp_no': 'EMP-900',
            'creator_id': creator.id,
            'worker_id': worker.id,
            'requester_id': requester.id,
        }


def _build_payload(worker_id, requester_id, serial_suffix):
    return {
        'status': '대기',
        'work_date': '2024-09-10',
        'work_dept_code': 'DEPT-INFRA',
        'worker_id': worker_id,
        'request_dept_code': 'DEPT-DEV',
        'requester_id': requester_id,
        'manufacturer_code': 'MFG-SAMSUNG',
        'disk_code': 'DISK-PM9A3',
        'serial_number': f'SN-{serial_suffix:04d}',
        'success_yn': 0,
        'failure_reason': '초기 등록',
        'remark': '테스트 케이스',
    }


def test_data_delete_register_crud_flow(client, app):
    profiles = _seed_profiles(app)
    with client.session_transaction() as sess:
        sess['emp_no'] = profiles['creator_emp_no']
        sess['user_id'] = profiles['creator_id']
    create_resp = client.post(
        '/api/datacenter/data-deletion',
        json=_build_payload(profiles['worker_id'], profiles['requester_id'], 1),
    )
    assert create_resp.status_code == 201
    created_payload = create_resp.get_json()
    assert created_payload['success'] is True
    created_item = created_payload['item']
    assert created_item['success_yn'] == 0
    entry_id = created_item['id']

    register_resp = client.get('/api/datacenter/data-deletion/registers')
    assert register_resp.status_code == 200
    register_data = register_resp.get_json()
    assert register_data['total'] == 1

    records_resp = client.get('/api/datacenter/data-deletion/records')
    assert records_resp.status_code == 200
    assert records_resp.get_json()['total'] == 0

    detail_resp = client.get(f'/api/datacenter/data-deletion/{entry_id}')
    assert detail_resp.status_code == 200
    assert detail_resp.get_json()['item']['serial_number'] == 'SN-0001'

    update_resp = client.put(
        f'/api/datacenter/data-deletion/{entry_id}',
        json={'status': '완료', 'success': 'O', 'failure_reason': '', 'remark': '완료 처리'},
    )
    assert update_resp.status_code == 200
    updated_item = update_resp.get_json()['item']
    assert updated_item['status'] == '완료'
    assert updated_item['success_yn'] == 1

    records_after = client.get('/api/datacenter/data-deletion/records').get_json()
    assert records_after['total'] == 1
    assert records_after['items'][0]['id'] == entry_id

    delete_resp = client.delete(f'/api/datacenter/data-deletion/{entry_id}')
    assert delete_resp.status_code == 200
    assert delete_resp.get_json()['deleted'] == 1

    empty_resp = client.get('/api/datacenter/data-deletion/registers').get_json()
    assert empty_resp['total'] == 0

    second = client.post(
        '/api/datacenter/data-deletion',
        json=_build_payload(profiles['worker_id'], profiles['requester_id'], 2),
    )
    third = client.post(
        '/api/datacenter/data-deletion',
        json=_build_payload(profiles['worker_id'], profiles['requester_id'], 3),
    )
    assert second.status_code == 201
    assert third.status_code == 201
    second_id = second.get_json()['item']['id']
    third_id = third.get_json()['item']['id']

    bulk_resp = client.post('/api/datacenter/data-deletion/bulk-delete', json={'ids': [second_id, third_id]})
    assert bulk_resp.status_code == 200
    bulk_payload = bulk_resp.get_json()
    assert bulk_payload['success'] is True
    assert bulk_payload['deleted'] == 2
