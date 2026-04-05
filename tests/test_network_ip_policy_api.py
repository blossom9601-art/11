def test_network_ip_policy_list_empty(client):
    response = client.get('/api/network/ip-policies')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['success'] is True
    assert payload['items'] == []
    assert payload['total'] == 0


def test_network_ip_policy_crud_flow(authed_client):
    create_payload = {
        'status': 'ACTIVE',
        'ip_version': 'IPv4',
        'start_ip': '10.0.0.0',
        'end_ip': '10.0.0.255',
        'role': 'SERVER',
        'location': 'FC-DC',
        'policy_name': 'Primary Range',
        'policy_code': 'IP_RANGE_PRIMARY',
        'utilization_rate': 25.5,
    }
    create_resp = authed_client.post('/api/network/ip-policies', json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.get_json()
    assert created['success'] is True
    item = created['item']
    assert item['status'] == 'ACTIVE'
    assert item['ip_version'] == 'IPv4'
    assert item['start_ip'] == '10.0.0.0'
    assert item['end_ip'] == '10.0.0.255'
    assert item['ip_count'] == 256
    assert item['policy_code'] == 'IP_RANGE_PRIMARY'
    policy_id = item['id']

    # Address range list should auto-generate rows based on start/end
    addr_list = authed_client.get(f'/api/network/ip-policies/{policy_id}/addresses?page=1&page_size=10')
    assert addr_list.status_code == 200
    addr_payload = addr_list.get_json()
    assert addr_payload['success'] is True
    assert addr_payload['total'] == 256
    assert len(addr_payload['items']) == 10
    assert addr_payload['items'][0]['ip_address'] == '10.0.0.0'

    # Save a couple of per-IP fields, then re-fetch and verify overlay
    save_resp = authed_client.put(
        f'/api/network/ip-policies/{policy_id}/addresses',
        json={
            'items': [
                {
                    'ip_address': '10.0.0.0',
                    'status': '활성',
                    'role': 'VIP',
                    'dns_domain': 'example.com',
                    'system_name': 'SYS-A',
                    'port': '443',
                    'note': 'seed',
                },
                {
                    'ip_address': '10.0.0.1',
                    'status': '예약',
                    'role': 'Loopback',
                    'dns_domain': '',
                    'system_name': '',
                    'port': '',
                    'note': '',
                },
            ]
        },
    )
    assert save_resp.status_code == 200
    assert save_resp.get_json()['success'] is True

    addr_list2 = authed_client.get(f'/api/network/ip-policies/{policy_id}/addresses?page=1&page_size=2')
    assert addr_list2.status_code == 200
    addr_payload2 = addr_list2.get_json()
    assert addr_payload2['items'][0]['ip_address'] == '10.0.0.0'
    assert addr_payload2['items'][0]['status'] == '활성'
    assert addr_payload2['items'][0]['role'] == 'VIP'
    assert addr_payload2['items'][0]['dns_domain'] == 'example.com'
    assert addr_payload2['items'][0]['system_name'] == 'SYS-A'
    assert addr_payload2['items'][0]['port'] == '443'
    assert addr_payload2['items'][0]['note'] == 'seed'

    detail_resp = authed_client.get(f'/api/network/ip-policies/{policy_id}')
    assert detail_resp.status_code == 200
    detail = detail_resp.get_json()
    assert detail['item']['id'] == policy_id

    update_payload = {
        'status': 'RESERVED',
        'role': 'MGMT',
        'allocation_rate': 80,
    }
    update_resp = authed_client.put(f'/api/network/ip-policies/{policy_id}', json=update_payload)
    assert update_resp.status_code == 200
    updated = update_resp.get_json()
    assert updated['item']['status'] == 'RESERVED'
    assert updated['item']['role'] == 'MGMT'
    assert updated['item']['utilization_rate'] == 80

    list_resp = authed_client.get('/api/network/ip-policies?q=MGMT')
    assert list_resp.status_code == 200
    listed = list_resp.get_json()
    assert listed['total'] == 1
    assert listed['items'][0]['role'] == 'MGMT'

    delete_resp = authed_client.delete(f'/api/network/ip-policies/{policy_id}')
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload['success'] is True
    assert delete_payload['deleted'] == 1

    # Create another record to validate bulk-delete path
    secondary_payload = {
        'status': 'ACTIVE',
        'start_ip': '172.16.0.0',
        'end_ip': '172.16.0.3',
        'role': 'EDGE',
        'policy_code': 'IP_RANGE_SECONDARY',
    }
    second_resp = authed_client.post('/api/network/ip-policies', json=secondary_payload)
    assert second_resp.status_code == 201
    second_id = second_resp.get_json()['item']['id']

    bulk_resp = authed_client.post('/api/network/ip-policies/bulk-delete', json={'ids': [second_id]})
    assert bulk_resp.status_code == 200
    bulk_payload = bulk_resp.get_json()
    assert bulk_payload['success'] is True
    assert bulk_payload['deleted'] == 1

    final_list = authed_client.get('/api/network/ip-policies')
    assert final_list.status_code == 200
    assert final_list.get_json()['total'] == 0
