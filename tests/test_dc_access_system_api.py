import json


def _ensure_user(client):
    # Try to create a user via existing user APIs if present; otherwise fall back to DB seeding.
    # Most of the suite uses DB fixtures, so keep this minimal and robust.
    from app import db
    from app.models import UserProfile

    user = UserProfile.query.first()
    if user:
        return user

    user = UserProfile(
        emp_no='ACS_TEST_001',
        name='Test User',
        department='QA',
        email='test.user@example.com',
    )
    db.session.add(user)
    db.session.commit()
    return user


def test_dc_access_system_crud_flow(client, app):
    from app import db

    with app.app_context():
        actor = _ensure_user(client)
        actor_id = actor.id

    # 1) Create
    payload = {
        'system_code': 'ACS-001',
        'business_status_code': 'OPERATING',
        'business_name': '출입통제',
        'system_name': '출입통제시스템 1',
        'created_by': actor_id,
        'manufacturer_name': 'VendorX',
    }
    res = client.post('/api/datacenter/access/systems', data=json.dumps(payload), content_type='application/json')
    assert res.status_code == 201, res.data
    created = res.get_json()
    assert created['id']
    assert created['system_code'] == 'ACS-001'

    system_id = created['id']

    # 2) List (should include)
    res = client.get('/api/datacenter/access/systems')
    assert res.status_code == 200
    rows = res.get_json()
    assert any(r['id'] == system_id for r in rows)

    # 3) Get
    res = client.get(f'/api/datacenter/access/systems/{system_id}')
    assert res.status_code == 200
    row = res.get_json()
    assert row['system_code'] == 'ACS-001'

    # 4) Update
    upd = {
        'updated_by': actor_id,
        'system_name': '출입통제시스템 1 (수정)',
        'system_ip': '10.0.0.10',
    }
    res = client.put(f'/api/datacenter/access/systems/{system_id}', data=json.dumps(upd), content_type='application/json')
    assert res.status_code == 200
    row = res.get_json()
    assert row['system_name'] == '출입통제시스템 1 (수정)'
    assert row['system_ip'] == '10.0.0.10'

    # 5) Soft delete
    res = client.delete(
        f'/api/datacenter/access/systems/{system_id}',
        data=json.dumps({'deleted_by': actor_id}),
        content_type='application/json',
    )
    assert res.status_code == 200
    assert res.get_json()['success'] is True

    # 6) List excludes deleted
    res = client.get('/api/datacenter/access/systems')
    assert res.status_code == 200
    rows = res.get_json()
    assert all(r['id'] != system_id for r in rows)

    # 7) Get deleted returns 404 by default
    res = client.get(f'/api/datacenter/access/systems/{system_id}')
    assert res.status_code == 404

    # 8) include_deleted shows it
    res = client.get(f'/api/datacenter/access/systems/{system_id}?include_deleted=true')
    assert res.status_code == 200
    row = res.get_json()
    assert row['id'] == system_id
    assert int(row['is_deleted']) == 1


def test_dc_access_system_bulk_delete(client, app):
    import uuid

    with app.app_context():
        actor = _ensure_user(client)
        actor_id = actor.id

    # Create two rows
    codes = [f'ACS-{uuid.uuid4().hex[:6].upper()}', f'ACS-{uuid.uuid4().hex[:6].upper()}']
    ids = []
    for code in codes:
        res = client.post(
            '/api/datacenter/access/systems',
            data=json.dumps(
                {
                    'system_code': code,
                    'business_status_code': 'OPERATING',
                    'business_name': '출입통제',
                    'system_name': f'출입통제시스템 {code}',
                    'created_by': actor_id,
                }
            ),
            content_type='application/json',
        )
        assert res.status_code == 201
        ids.append(res.get_json()['id'])

    # Bulk delete
    res = client.post(
        '/api/datacenter/access/systems/bulk-delete',
        data=json.dumps({'ids': ids, 'deleted_by': actor_id}),
        content_type='application/json',
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body['success'] is True
    assert body['deleted'] == 2

    # Listing should exclude deleted
    res = client.get('/api/datacenter/access/systems')
    assert res.status_code == 200
    rows = res.get_json()
    assert all(r['id'] not in ids for r in rows)
