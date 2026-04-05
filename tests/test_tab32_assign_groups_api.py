def test_tab32_assign_groups_crud(client):
    # Create group
    payload = {
        'scope_key': 'ptl',
        'asset_id': 321,
        'group_name': 'ASG-1',
        'assigned_capacity': '10TB',
        'group_desc': 'desc',
        'remark': 'remark',
    }
    r = client.post('/api/tab32-assign-groups', json=payload)
    assert r.status_code == 201
    created = r.get_json()
    assert created['id']
    assert created['scope_key'] == 'ptl'
    assert created['asset_id'] == 321
    assert created['group_name'] == 'ASG-1'
    assert created.get('assigned_capacity') == '10TB'

    group_id = created['id']

    # List
    r = client.get('/api/tab32-assign-groups?scope_key=ptl&asset_id=321&page=1&page_size=50')
    assert r.status_code == 200
    data = r.get_json()
    assert data['total'] == 1
    assert data['items'][0]['id'] == group_id

    # Update group
    r = client.put(
        f'/api/tab32-assign-groups/{group_id}',
        json={
            'group_name': 'ASG-1-renamed',
            'assigned_capacity': '20TB',
            'group_desc': 'desc2',
            'remark': 'remark2',
        },
    )
    assert r.status_code == 200
    updated = r.get_json()
    assert updated['group_name'] == 'ASG-1-renamed'
    assert updated.get('assigned_capacity') == '20TB'
    assert updated['remark'] == 'remark2'

    # Delete group
    r = client.delete(f'/api/tab32-assign-groups/{group_id}')
    assert r.status_code == 200
    assert r.get_json()['ok'] is True

    r = client.get('/api/tab32-assign-groups?scope_key=ptl&asset_id=321&page=1&page_size=50')
    assert r.status_code == 200
    data = r.get_json()
    assert data['total'] == 0


def test_tab32_assign_groups_children_crud(client):
    # Create group
    r = client.post(
        '/api/tab32-assign-groups',
        json={
            'scope_key': 'san',
            'asset_id': 999,
            'group_name': 'G-CHILD',
            'assigned_capacity': '5TB',
            'group_desc': '',
            'remark': '',
        },
    )
    assert r.status_code == 201
    group_id = r.get_json()['id']

    # Hosts: create/list/update/delete
    r = client.post(
        f'/api/tab32-assign-groups/{group_id}/hosts',
        json={'system_name': 'HOST-1', 'os_type': 'Linux', 'wwid_ip': 'w1', 'port_alloc': 'p1'},
    )
    assert r.status_code == 201
    host_id = r.get_json()['id']

    r = client.get(f'/api/tab32-assign-groups/{group_id}/hosts')
    assert r.status_code == 200
    assert len(r.get_json()['items']) == 1

    r = client.put(
        f'/api/tab32-assign-groups/hosts/{host_id}',
        json={'system_name': 'HOST-1b', 'os_type': 'Windows', 'wwid_ip': 'w2', 'port_alloc': 'p2'},
    )
    assert r.status_code == 200
    assert r.get_json()['system_name'] == 'HOST-1b'

    r = client.delete(f'/api/tab32-assign-groups/hosts/{host_id}')
    assert r.status_code == 200
    assert r.get_json()['ok'] is True

    # Volumes: create/list/update/delete
    r = client.post(
        f'/api/tab32-assign-groups/{group_id}/volumes',
        json={
            'volume_name': 'VOL-1',
            'uuid': 'u1',
            'capacity': '10T',
            'thin_thick': 'Thin',
            'shared': 'Y',
            'replicated': 'N',
            'assigned_date': '2026-01-25',
        },
    )
    assert r.status_code == 201
    volume_id = r.get_json()['id']

    r = client.get(f'/api/tab32-assign-groups/{group_id}/volumes')
    assert r.status_code == 200
    assert len(r.get_json()['items']) == 1

    r = client.put(
        f'/api/tab32-assign-groups/volumes/{volume_id}',
        json={
            'volume_name': 'VOL-1b',
            'uuid': 'u2',
            'capacity': '20T',
            'thin_thick': 'Thick',
            'shared': 'N',
            'replicated': 'Y',
            'assigned_date': '2026-01-26',
        },
    )
    assert r.status_code == 200
    assert r.get_json()['volume_name'] == 'VOL-1b'

    r = client.delete(f'/api/tab32-assign-groups/volumes/{volume_id}')
    assert r.status_code == 200
    assert r.get_json()['ok'] is True

    # Replications: create/list/update/delete
    r = client.post(
        f'/api/tab32-assign-groups/{group_id}/replications',
        json={
            'local_volume_name': 'LV',
            'repl_storage': 'R-STG',
            'repl_volume_name': 'RV',
            'capacity': '10T',
        },
    )
    assert r.status_code == 201
    repl_id = r.get_json()['id']

    r = client.get(f'/api/tab32-assign-groups/{group_id}/replications')
    assert r.status_code == 200
    assert len(r.get_json()['items']) == 1

    r = client.put(
        f'/api/tab32-assign-groups/replications/{repl_id}',
        json={
            'local_volume_name': 'LV2',
            'repl_storage': 'R2',
            'repl_volume_name': 'RV2',
            'capacity': '20T',
        },
    )
    assert r.status_code == 200
    assert r.get_json()['repl_storage'] == 'R2'

    r = client.delete(f'/api/tab32-assign-groups/replications/{repl_id}')
    assert r.status_code == 200
    assert r.get_json()['ok'] is True

    # Cascade delete sanity: create one child again then delete group
    r = client.post(
        f'/api/tab32-assign-groups/{group_id}/hosts',
        json={'system_name': 'HOST-X', 'os_type': '', 'wwid_ip': '', 'port_alloc': ''},
    )
    assert r.status_code == 201

    r = client.delete(f'/api/tab32-assign-groups/{group_id}')
    assert r.status_code == 200
    assert r.get_json()['ok'] is True

    r = client.get('/api/tab32-assign-groups?scope_key=san&asset_id=999&page=1&page_size=50')
    assert r.status_code == 200
    assert r.get_json()['total'] == 0
