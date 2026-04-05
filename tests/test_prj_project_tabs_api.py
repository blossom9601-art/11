import json

import pytest

from app.models import db, OrgDepartment, PrjTabCost, UserProfile


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
        sess['emp_no'] = emp_no


def test_prj_project_tab_crud_roundtrip(client, seeded_org):
    _login(client, user_id=seeded_org['user_id'], emp_no=seeded_org['user_emp_no'])

    # Create a project first
    payload_owned = {
        'project_name': 'Tab CRUD Project',
        'project_type': 'SW',
        'owner_dept_id': seeded_org['dept_id'],
        'manager_user_id': seeded_org['user_id'],
        'status': 'ACTIVE',
    }
    res_create = client.post('/api/prj/projects', json=payload_owned)
    assert res_create.status_code == 201
    project_id = res_create.get_json()['item']['id']

    # Create an item in a tab
    res_post = client.post(
        f'/api/prj/projects/{project_id}/tabs/risk',
        json={'payload': {'risk_name': 'R1', 'severity': 3}},
    )
    assert res_post.status_code == 201
    created_item = res_post.get_json()['item']
    assert created_item['project_id'] == project_id
    assert created_item['payload']['risk_name'] == 'R1'
    item_id = created_item['id']

    # List tab items
    res_list = client.get(f'/api/prj/projects/{project_id}/tabs/risk')
    assert res_list.status_code == 200
    data_list = res_list.get_json()
    assert data_list['total'] == 1
    assert data_list['items'][0]['id'] == item_id

    # Update item
    res_put = client.put(
        f'/api/prj/projects/{project_id}/tabs/risk/{item_id}',
        json={'payload': {'risk_name': 'R1-updated', 'severity': 4}},
    )
    assert res_put.status_code == 200
    updated = res_put.get_json()['item']
    assert updated['payload']['risk_name'] == 'R1-updated'

    # Soft delete
    res_del = client.delete(f'/api/prj/projects/{project_id}/tabs/risk/{item_id}')
    assert res_del.status_code == 200
    assert res_del.get_json()['deleted'] == 1

    # List hides deleted by default
    res_list2 = client.get(f'/api/prj/projects/{project_id}/tabs/risk')
    assert res_list2.status_code == 200
    assert res_list2.get_json()['total'] == 0

    # Include deleted shows it
    res_list3 = client.get(f'/api/prj/projects/{project_id}/tabs/risk?include_deleted=1')
    assert res_list3.status_code == 200
    assert res_list3.get_json()['total'] == 1
    assert res_list3.get_json()['items'][0]['is_deleted'] == 1


def test_prj_project_tab_integrity_crud_roundtrip(client, seeded_org):
    _login(client, user_id=seeded_org['user_id'], emp_no=seeded_org['user_emp_no'])

    payload_owned = {
        'project_name': 'Tab71 Integrity CRUD Project',
        'project_type': 'SW',
        'owner_dept_id': seeded_org['dept_id'],
        'manager_user_id': seeded_org['user_id'],
        'status': 'ACTIVE',
    }
    res_create = client.post('/api/prj/projects', json=payload_owned)
    assert res_create.status_code == 201
    project_id = res_create.get_json()['item']['id']

    # tab81-integrity stores requirements as JSON payload
    res_post = client.post(
        f'/api/prj/projects/{project_id}/tabs/integrity',
        json={
            'payload': {
                'requirements': {
                    'rows': [
                        {
                            'category': 'SAMPLE',
                            'type': 'FUNC',
                            'uniq_no': 'REQ-1',
                            'name': 'Requirement 1',
                            'definition': 'Def',
                            'detail': 'Detail',
                            'owner': 'Alice',
                        }
                    ]
                }
            }
        },
    )
    assert res_post.status_code == 201
    created_item = res_post.get_json()['item']
    assert created_item['project_id'] == project_id
    assert created_item['payload']['requirements']['rows'][0]['uniq_no'] == 'REQ-1'
    item_id = created_item['id']

    res_list = client.get(f'/api/prj/projects/{project_id}/tabs/integrity')
    assert res_list.status_code == 200
    data_list = res_list.get_json()
    assert data_list['total'] == 1
    assert data_list['items'][0]['id'] == item_id


def test_prj_project_tab_cost_eva_roundtrip(client, app, seeded_org):
    _login(client, user_id=seeded_org['user_id'], emp_no=seeded_org['user_emp_no'])

    payload_owned = {
        'project_name': 'Tab74 Cost (EVA) CRUD Project',
        'project_type': 'SW',
        'owner_dept_id': seeded_org['dept_id'],
        'manager_user_id': seeded_org['user_id'],
        'status': 'ACTIVE',
    }
    res_create = client.post('/api/prj/projects', json=payload_owned)
    assert res_create.status_code == 201
    project_id = res_create.get_json()['item']['id']

    key = 'WBS-1 | Activity-A | Task-A | Owner-A'
    eva_map = {key: {'pv': 1000, 'ev': 400, 'ac': 250}}

    res_post = client.post(
        f'/api/prj/projects/{project_id}/tabs/cost',
        json={'payload': {'eva_map': eva_map}},
    )
    assert res_post.status_code == 201
    created_item = res_post.get_json()['item']
    assert created_item['project_id'] == project_id
    assert created_item['payload']['eva_map'][key]['pv'] == 1000

    res_list = client.get(f'/api/prj/projects/{project_id}/tabs/cost')
    assert res_list.status_code == 200
    data_list = res_list.get_json()
    assert data_list['total'] == 1
    assert data_list['items'][0]['payload']['eva_map'][key]['ac'] == 250

    with app.app_context():
        rows = (
            PrjTabCost.query.filter_by(project_id=project_id, is_deleted=0)
            .order_by(PrjTabCost.id.asc())
            .all()
        )
        assert len(rows) == 1
        payload_json = rows[0].payload_json
        payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
        assert payload['eva_map'][key]['ev'] == 400


def test_prj_project_tab_unauth_returns_401(client):
    res = client.get('/api/prj/projects/1/tabs/risk')
    assert res.status_code == 401
    data = res.get_json()
    assert data and data.get('success') is False
