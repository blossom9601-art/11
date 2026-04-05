import pytest

from app.models import db, OrgDepartment, UserProfile


@pytest.fixture
def seeded_user(app):
    with app.app_context():
        dept = OrgDepartment(dept_code='OPS', dept_name='OPS', created_by='test')
        db.session.add(dept)
        db.session.flush()
        user = UserProfile(emp_no='VPN001', name='VPN Tester', department_id=dept.id, department=dept.dept_name)
        db.session.add(user)
        db.session.commit()
        return user.id


def test_vpn_partner_line_device_crud(client, app, seeded_user):
    user_id = seeded_user

    # Create partner
    resp = client.post(
        '/api/network/vpn-partners',
        json={
            'org_name': 'A은행',
            'partner_type': 'VPN1',
            'note': 'partner note',
            'created_by_user_id': user_id,
        },
    )
    assert resp.status_code == 201
    partner = resp.get_json()['item']
    assert partner['org_name'] == 'A은행'
    partner_id = partner['id']

    # List partners
    resp = client.get('/api/network/vpn-partners')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['total'] >= 1

    # Create line
    resp = client.post(
        '/api/network/vpn-lines',
        json={
            'vpn_partner_id': partner_id,
            'status': '운용',
            'line_speed': '100M',
            'line_count': 2,
            'protocol': 'TCP',
            'manager': '우리회사',
            'cipher': 'AES-256',
            'upper_country': '서울본사',
            'upper_country_address': '서울특별시',
            'lower_country': '판교지사',
            'lower_country_address': '경기도',
            'created_by_user_id': user_id,
        },
    )
    assert resp.status_code == 201
    line = resp.get_json()['item']
    assert line['vpn_partner_id'] == partner_id
    line_id = line['id']

    # Create device
    resp = client.post(
        '/api/network/vpn-line-devices',
        json={
            'vpn_line_id': line_id,
            'device_name': 'FW-A',
            'created_by_user_id': user_id,
        },
    )
    assert resp.status_code == 201
    device = resp.get_json()['item']
    assert device['vpn_line_id'] == line_id
    device_id = device['id']

    # Get device
    resp = client.get(f'/api/network/vpn-line-devices/{device_id}')
    assert resp.status_code == 200
    assert resp.get_json()['item']['device_name'] == 'FW-A'

    # Update line
    resp = client.put(
        f'/api/network/vpn-lines/{line_id}',
        json={
            'line_speed': '1G',
            'updated_by_user_id': user_id,
        },
    )
    assert resp.status_code == 200
    assert resp.get_json()['item']['line_speed'] == '1G'

    # Soft delete device
    resp = client.delete(
        f'/api/network/vpn-line-devices/{device_id}',
        json={'actor_user_id': user_id},
    )
    assert resp.status_code == 200

    # Default list excludes deleted
    resp = client.get('/api/network/vpn-line-devices')
    assert resp.status_code == 200
    items = resp.get_json()['items']
    assert all(int(r.get('id')) != device_id for r in items)

    # include_deleted shows it
    resp = client.get('/api/network/vpn-line-devices?include_deleted=1')
    assert resp.status_code == 200
    items = resp.get_json()['items']
    assert any(int(r.get('id')) == device_id for r in items)
