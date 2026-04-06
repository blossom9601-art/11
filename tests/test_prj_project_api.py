import pytest

from app.models import db, OrgDepartment, UserProfile


@pytest.fixture
def seeded_org(app):
    with app.app_context():
        dept = OrgDepartment(dept_code='D001', dept_name='Engineering', created_by='test')
        db.session.add(dept)
        db.session.flush()

        user = UserProfile(emp_no='E001', name='Alice', department_id=dept.id, department=dept.dept_name)
        other_user = UserProfile(emp_no='E002', name='Bob', department_id=dept.id, department=dept.dept_name)
        db.session.add_all([user, other_user])
        db.session.commit()
        return {
            'dept_id': dept.id,
            'user_id': user.id,
            'user_emp_no': user.emp_no,
            'other_user_id': other_user.id,
        }


def _login(client, *, user_id: int, emp_no: str):
    with client.session_transaction() as sess:
        sess['user_id'] = user_id
        sess['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()
        sess['emp_no'] = emp_no


def test_prj_projects_unauth_returns_401_not_404(client):
    res = client.get('/api/prj/projects')
    assert res.status_code == 401
    data = res.get_json()
    assert data and data.get('success') is False


def test_prj_project_crud_and_scopes(client, seeded_org):
    _login(client, user_id=seeded_org['user_id'], emp_no=seeded_org['user_emp_no'])

    payload_owned = {
        'project_name': 'Owned Project',
        'project_type': 'SW',
        'owner_dept_id': seeded_org['dept_id'],
        'manager_user_id': seeded_org['user_id'],
        'status': 'ACTIVE',
        'priority': 'P1',
        'budget_amount': 1000,
        'start_date': '2025-01-01',
        'expected_end_date': '2025-02-01',
        'progress_percent': 10,
    }
    res_create_owned = client.post('/api/prj/projects', json=payload_owned)
    assert res_create_owned.status_code == 201
    created_owned = res_create_owned.get_json()['item']
    assert created_owned['project_name'] == 'Owned Project'
    owned_id = created_owned['id']

    # Leader/member mapping should exist
    res_members_owned = client.get(f'/api/prj/projects/{owned_id}/members')
    assert res_members_owned.status_code == 200
    data_members_owned = res_members_owned.get_json()
    assert data_members_owned['leader']['user_id'] == seeded_org['user_id']

    payload_participating = {
        'project_name': 'Participating Project',
        'project_type': 'HW',
        'owner_dept_id': seeded_org['dept_id'],
        'manager_user_id': seeded_org['other_user_id'],
        'status': 'ACTIVE',
        'participant_user_ids': [seeded_org['user_id']],
    }
    res_create_part = client.post('/api/prj/projects', json=payload_participating)
    assert res_create_part.status_code == 201
    participating_id = res_create_part.get_json()['item']['id']

    res_members_part = client.get(f'/api/prj/projects/{participating_id}/members')
    assert res_members_part.status_code == 200
    members_payload = res_members_part.get_json()
    assert members_payload['leader']['user_id'] == seeded_org['other_user_id']
    assert {m['user_id'] for m in members_payload['members']} == {seeded_org['user_id']}

    res_list_all = client.get('/api/prj/projects')
    assert res_list_all.status_code == 200
    items_all = res_list_all.get_json()['items']
    ids_all = {row['id'] for row in items_all}
    assert owned_id in ids_all
    assert participating_id in ids_all

    res_list_owned = client.get('/api/prj/projects?scope=owned')
    assert res_list_owned.status_code == 200
    ids_owned = {row['id'] for row in res_list_owned.get_json()['items']}
    assert owned_id in ids_owned
    assert participating_id not in ids_owned

    res_list_part = client.get('/api/prj/projects?scope=participating')
    assert res_list_part.status_code == 200
    ids_part = {row['id'] for row in res_list_part.get_json()['items']}
    assert participating_id in ids_part
    assert owned_id not in ids_part

    # Replace members endpoint
    res_replace = client.put(f'/api/prj/projects/{participating_id}/members', json={'participant_user_ids': []})
    assert res_replace.status_code == 200
    assert res_replace.get_json()['members'] == []

    res_list_part2 = client.get('/api/prj/projects?scope=participating')
    ids_part2 = {row['id'] for row in res_list_part2.get_json()['items']}
    assert participating_id not in ids_part2

    res_get = client.get(f'/api/prj/projects/{owned_id}')
    assert res_get.status_code == 200
    assert res_get.get_json()['item']['id'] == owned_id

    res_update = client.put(f'/api/prj/projects/{owned_id}', json={'status': 'DONE', 'progress_percent': 100})
    assert res_update.status_code == 200
    assert res_update.get_json()['item']['status'] == 'DONE'
    assert res_update.get_json()['item']['progress_percent'] == 100

    res_delete = client.delete(f'/api/prj/projects/{owned_id}')
    assert res_delete.status_code == 200
    assert res_delete.get_json()['deleted'] == 1

    res_get_deleted = client.get(f'/api/prj/projects/{owned_id}')
    assert res_get_deleted.status_code == 404

    res_get_deleted_included = client.get(f'/api/prj/projects/{owned_id}?include_deleted=1')
    assert res_get_deleted_included.status_code == 200
    assert res_get_deleted_included.get_json()['item']['is_deleted'] == 1

    res_list_after_delete = client.get('/api/prj/projects')
    ids_after_delete = {row['id'] for row in res_list_after_delete.get_json()['items']}
    assert owned_id not in ids_after_delete

    res_list_include_deleted = client.get('/api/prj/projects?include_deleted=1')
    ids_include_deleted = {row['id'] for row in res_list_include_deleted.get_json()['items']}
    assert owned_id in ids_include_deleted
