from app.models import db, UserProfile


def _seed_profiles(app):
    with app.app_context():
        creator = UserProfile(emp_no='EMP-910', name='System Creator')
        db.session.add(creator)
        db.session.commit()
        return {
            'creator_emp_no': creator.emp_no,
            'creator_id': creator.id,
        }


def _build_payload(serial_suffix: int):
    return {
        'business_status_code': 'ACTIVE',
        'business_name': '주문 처리',
        'system_name': f'order-api-{serial_suffix:02d}',
        'system_ip': f'10.0.0.{serial_suffix}',
        'mgmt_ip': f'192.168.0.{serial_suffix}',
        'manufacturer_code': 'MFG-SAMSUNG',
        'system_model_name': 'DL380 Gen10',
        'serial_number': f'SN-SYS-{serial_suffix:04d}',
        'center_code': 'CENTER-SEOUL',
        'rack_position': 'R1-C03-U12',
        'rack_code': 'RACK-001',
        'system_dept_code': 'DEPT-INFRA',
        'service_dept_code': 'DEPT-DEV',
        'delete_target_desc': 'DB/로그',
        'retention_policy': '3년 보관 후 삭제',
        'remark': '테스트 등록',
    }


def test_data_delete_system_crud_flow(client, app):
    profiles = _seed_profiles(app)
    with client.session_transaction() as sess:
        sess['emp_no'] = profiles['creator_emp_no']
        sess['user_id'] = profiles['creator_id']

    create_resp = client.post('/api/datacenter/data-deletion-systems', json=_build_payload(1))
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    system_id = created['item']['id']
    assert created['item']['system_name'] == 'order-api-01'

    list_resp = client.get('/api/datacenter/data-deletion-systems')
    assert list_resp.status_code == 200
    list_payload = list_resp.get_json()
    assert list_payload['success'] is True
    assert list_payload['total'] == 1

    detail_resp = client.get(f'/api/datacenter/data-deletion-systems/{system_id}')
    assert detail_resp.status_code == 200
    detail_payload = detail_resp.get_json()
    assert detail_payload['item']['serial_number'] == 'SN-SYS-0001'

    update_resp = client.put(
        f'/api/datacenter/data-deletion-systems/{system_id}',
        json={'remark': '수정됨', 'next_planned_delete_at': '2026-01-01 00:00:00'},
    )
    assert update_resp.status_code == 200
    assert update_resp.get_json()['item']['remark'] == '수정됨'

    delete_resp = client.delete(f'/api/datacenter/data-deletion-systems/{system_id}')
    assert delete_resp.status_code == 200
    assert delete_resp.get_json()['deleted'] == 1

    empty_after = client.get('/api/datacenter/data-deletion-systems').get_json()
    assert empty_after['total'] == 0

    second = client.post('/api/datacenter/data-deletion-systems', json=_build_payload(2))
    third = client.post('/api/datacenter/data-deletion-systems', json=_build_payload(3))
    assert second.status_code == 201
    assert third.status_code == 201
    second_id = second.get_json()['item']['id']
    third_id = third.get_json()['item']['id']

    bulk = client.post('/api/datacenter/data-deletion-systems/bulk-delete', json={'ids': [second_id, third_id]})
    assert bulk.status_code == 200
    bulk_payload = bulk.get_json()
    assert bulk_payload['success'] is True
    assert bulk_payload['deleted'] == 2
