import json


def _ensure_department(app, *, dept_code: str, dept_name: str):
    from app import db
    from app.models import OrgDepartment

    row = OrgDepartment.query.filter_by(dept_code=dept_code).first()
    if row:
        return row

    row = OrgDepartment(
        dept_code=dept_code,
        dept_name=dept_name,
        created_by='system',
        is_deleted=False,
    )
    db.session.add(row)
    db.session.commit()
    return row


def _ensure_user(app, *, emp_no: str, name: str, department_id: int, department: str):
    from app import db
    from app.models import UserProfile

    row = UserProfile.query.filter_by(emp_no=emp_no).first()
    if row:
        return row

    row = UserProfile(
        emp_no=emp_no,
        name=name,
        department_id=department_id,
        department=department,
        email=f'{emp_no.lower()}@example.com',
    )
    db.session.add(row)
    db.session.commit()
    return row


def test_dc_access_permission_crud_flow(client, app):
    import uuid

    with app.app_context():
        suffix = uuid.uuid4().hex[:8]
        dept = _ensure_department(app, dept_code=f'DEPTEST_{suffix}', dept_name=f'테스트부서_{suffix}')
        user = _ensure_user(
            app,
            emp_no=f'PERM_USER_{suffix}',
            name=f'권한테스트_{suffix}',
            department_id=dept.id,
            department=dept.dept_name,
        )

        # Use same user as actor for simplicity (store primitives; instances detach after context)
        dept_id = int(dept.id)
        dept_name = str(dept.dept_name)
        user_id = int(user.id)
        user_name = str(user.name)
        actor_id = int(user.id)

    # 1) Create
    payload = {
        'user_id': user_id,
        'department_id': dept_id,
        'person_type': '내부직원',
        'access_level': '상시출입',
        'status': '활성',
        'remark': 'pytest',
        'permission_start_date': '',
        'permission_end_date': '',
        'dc_future_room': 'O',
        'dc_future_control': 'X',
        'dc_eulji_room': 'X',
        'dc_disaster_room': 'X',
        'actor_user_id': actor_id,
    }
    res = client.post('/api/datacenter/access/permissions', data=json.dumps(payload), content_type='application/json')
    assert res.status_code == 201, res.data
    created = res.get_json()
    assert created['permission_id']
    assert created['id'] == created['permission_id']
    assert created['user_id'] == user_id
    assert created['department_id'] == dept_id
    assert created['name'] == user_name
    assert created['affiliation'] == dept_name

    permission_id = created['permission_id']

    # 2) List
    res = client.get('/api/datacenter/access/permissions')
    assert res.status_code == 200
    body = res.get_json()
    rows = body.get('items', body) if isinstance(body, dict) else body
    assert any(r['permission_id'] == permission_id for r in rows)

    # 3) Get
    res = client.get(f'/api/datacenter/access/permissions/{permission_id}')
    assert res.status_code == 200
    row = res.get_json()
    assert row['permission_id'] == permission_id

    # 4) Update
    upd = {
        'actor_user_id': actor_id,
        'status': '만료',
        'note': 'updated',
        'zone_futurecenter_dc': 'X',
        'zone_futurecenter_ops': 'O',
    }
    res = client.put(
        f'/api/datacenter/access/permissions/{permission_id}',
        data=json.dumps(upd),
        content_type='application/json',
    )
    assert res.status_code == 200, res.data
    row = res.get_json()
    assert row['status'] == '만료'
    assert row['note'] == 'updated'
    assert row['zone_futurecenter_dc'] == 'X'
    assert row['zone_futurecenter_ops'] == 'O'

    # 5) Delete
    res = client.delete(
        f'/api/datacenter/access/permissions/{permission_id}',
        data=json.dumps({'actor_user_id': actor_id}),
        content_type='application/json',
    )
    assert res.status_code == 200
    assert res.get_json()['success'] is True

    # 6) Get deleted -> 404
    res = client.get(f'/api/datacenter/access/permissions/{permission_id}')
    assert res.status_code == 404


def test_dc_access_permission_bulk_delete(client, app):
    import uuid

    with app.app_context():
        suffix = uuid.uuid4().hex[:8]
        dept = _ensure_department(app, dept_code=f'DEPTEST_B_{suffix}', dept_name=f'테스트부서B_{suffix}')
        user = _ensure_user(
            app,
            emp_no=f'PERM_USER_B_{suffix}',
            name=f'권한테스트B_{suffix}',
            department_id=dept.id,
            department=dept.dept_name,
        )
        dept_id = int(dept.id)
        user_id = int(user.id)
        actor_id = int(user.id)

    ids = []
    for i in range(2):
        res = client.post(
            '/api/datacenter/access/permissions',
            data=json.dumps(
                {
                    'user_id': user_id,
                    'department_id': dept_id,
                    'person_type': '내부직원',
                    'access_level': '상시출입',
                    'status': '활성',
                    'remark': f'bulk{i}',
                    'actor_user_id': actor_id,
                }
            ),
            content_type='application/json',
        )
        assert res.status_code == 201
        ids.append(res.get_json()['permission_id'])

    res = client.post(
        '/api/datacenter/access/permissions/bulk-delete',
        data=json.dumps({'ids': ids, 'actor_user_id': actor_id}),
        content_type='application/json',
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body['success'] is True
    assert body['deleted'] == 2

    # Ensure they're gone
    res = client.get('/api/datacenter/access/permissions')
    assert res.status_code == 200
    body = res.get_json()
    rows = body.get('items', body) if isinstance(body, dict) else body
    assert all(r['permission_id'] not in ids for r in rows)
