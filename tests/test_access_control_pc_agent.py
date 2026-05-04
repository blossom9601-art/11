from app.models import UserProfile, db
from app.services import web_access_control_service as service


def test_pc_agent_user_mapping_lifecycle(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        admin = UserProfile(
            emp_no='PCADMIN01',
            name='PC Agent Admin',
            role='ADMIN',
            department='IT',
            email='pc-admin@example.com',
        )
        target_user = UserProfile(
            emp_no='PCUSER01',
            name='PC Agent User',
            department='Infra',
            email='pc-user@example.com',
        )
        db.session.add_all([admin, target_user])
        db.session.commit()
        target_user_id = target_user.id

        actor = {'user_id': admin.id, 'emp_no': admin.emp_no, 'name': admin.name, 'role': admin.role}
        agent = service.upsert_pc_agent(
            {
                'agent_id': 'agent-test-001',
                'hostname': 'AGENT-PC-001',
                'current_user': 'DOMAIN\\pcuser01',
                'ip_address': '192.0.2.15',
                'mac_address': '00:11:22:33:44:55',
                'agent_version': '1.0.0',
                'service_status': 'RUNNING',
                'heartbeat': True,
            },
            actor=actor,
            app=app,
        )

        assert agent['hostname'] == 'AGENT-PC-001'
        assert agent['sync_status'] == '정상'
        assert agent['operation_status'] == '활성'
        assert agent['agent_version_display'] == '1.0.0'
        listed = service.list_pc_agents({'keyword': 'AGENT-PC-001'}, app=app)
        assert listed['total'] == 1
        assert listed['summary']['visible_unmapped_count'] == 1

        mapped = service.map_pc_agent_user(agent['id'], target_user_id, actor, mapping_note='초기 매핑', app=app)
        assert mapped['mapped_user']['id'] == target_user_id
        assert mapped['mapped_user']['emp_no'] == 'PCUSER01'
        assert mapped['mapping_note'] == '초기 매핑'

        cleared = service.clear_pc_agent_user(agent['id'], actor=actor, app=app)
        assert cleared['mapped_user'] is None
        assert cleared['mapped_user_id'] is None


def test_pc_agent_api_allows_admin_mapping(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        admin = UserProfile(
            emp_no='PCAPIADMIN',
            name='PC API Admin',
            role='ADMIN',
            department='IT',
            email='pc-api-admin@example.com',
        )
        target_user = UserProfile(
            emp_no='PCAPIUSER',
            name='PC API User',
            department='Security',
            email='pc-api-user@example.com',
        )
        db.session.add_all([admin, target_user])
        db.session.commit()
        admin_id = admin.id
        target_user_id = target_user.id
        agent = service.upsert_pc_agent(
            {'agent_id': 'agent-api-001', 'hostname': 'AGENT-API-001', 'service_status': 'RUNNING', 'heartbeat': True},
            actor={'user_id': admin_id, 'emp_no': admin.emp_no, 'name': admin.name, 'role': admin.role},
            app=app,
        )

    client = app.test_client()
    with client.session_transaction() as session:
        session['emp_no'] = 'PCAPIADMIN'
        session['user_profile_id'] = admin_id

    list_response = client.get('/api/access-control/pc-agents?keyword=AGENT-API-001')
    assert list_response.status_code == 200
    assert list_response.get_json()['total'] == 1

    map_response = client.post(
        f"/api/access-control/pc-agents/{agent['id']}/user",
        json={'user_id': target_user_id, 'mapping_note': 'API 매핑'},
    )
    assert map_response.status_code == 200
    assert map_response.get_json()['item']['mapped_user']['emp_no'] == 'PCAPIUSER'

    export_response = client.get('/api/access-control/pc-agents?keyword=AGENT-API-001&export=1&page_size=5000')
    export_data = export_response.get_json()
    assert export_response.status_code == 200
    assert export_data['page_size'] == 5000
    assert export_data['summary']['total_count'] == 1
    assert export_data['summary']['mapped_count'] == 1

    clear_response = client.delete(f"/api/access-control/pc-agents/{agent['id']}/user")
    assert clear_response.status_code == 200
    assert clear_response.get_json()['item']['mapped_user'] is None


def test_pc_agent_bulk_delete_api(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        admin = UserProfile(
            emp_no='PCDELADMIN',
            name='PC Delete Admin',
            role='ADMIN',
            department='IT',
            email='pc-del-admin@example.com',
        )
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
        a1 = service.upsert_pc_agent(
            {'agent_id': 'agent-del-a', 'hostname': 'DEL-A', 'heartbeat': True},
            actor={'user_id': admin_id, 'emp_no': admin.emp_no, 'name': admin.name, 'role': admin.role},
            app=app,
        )
        a2 = service.upsert_pc_agent(
            {'agent_id': 'agent-del-b', 'hostname': 'DEL-B', 'heartbeat': True},
            actor={'user_id': admin_id, 'emp_no': admin.emp_no, 'name': admin.name, 'role': admin.role},
            app=app,
        )
        pk1 = a1['id']
        pk2 = a2['id']

    client = app.test_client()
    with client.session_transaction() as session:
        session['emp_no'] = 'PCDELADMIN'
        session['user_profile_id'] = admin_id

    r = client.post('/api/access-control/pc-agents/delete', json={'agent_ids': [pk1, pk2]})
    assert r.status_code == 200
    body = r.get_json()
    assert body['success'] is True
    assert body['deleted'] == 2

    with app.app_context():
        listed = service.list_pc_agents({'keyword': 'DEL-'}, app=app)
        assert listed['total'] == 0


def test_internal_gate_pc_agent_sync_disabled_without_secret(monkeypatch, app):
    monkeypatch.delenv('LUMINA_GATE_WEB_SYNC_SECRET', raising=False)
    client = app.test_client()
    rv = client.post('/api/internal/lumina-gate/pc-agent-sync', json={'agent_id': 'x'})
    assert rv.status_code == 503


def test_internal_gate_pc_agent_sync_rejects_wrong_token(monkeypatch, app):
    monkeypatch.setenv('LUMINA_GATE_WEB_SYNC_SECRET', 'sync-secret-test')
    client = app.test_client()
    rv = client.post(
        '/api/internal/lumina-gate/pc-agent-sync',
        json={'agent_id': 'gate-a', 'hostname': 'HOST-A'},
        headers={'Authorization': 'Bearer wrong-one'},
    )
    assert rv.status_code == 401


def test_internal_gate_pc_agent_sync_upserts_agent(monkeypatch, app):
    monkeypatch.setenv('LUMINA_GATE_WEB_SYNC_SECRET', 'sync-secret-test')
    with app.app_context():
        service.init_web_access_control_tables(app)
    client = app.test_client()
    rv = client.post(
        '/api/internal/lumina-gate/pc-agent-sync',
        json={
            'agent_id': 'gate-sync-host',
            'hostname': 'LAB-PC-77',
            'current_user': 'ops',
            'ip_address': '10.10.10.77',
            'service_status': 'RUNNING',
            'heartbeat': True,
        },
        headers={'Authorization': 'Bearer sync-secret-test'},
    )
    assert rv.status_code == 200
    body = rv.get_json()
    assert body['success'] is True
    assert body['item'].get('agent_id') == 'gate-sync-host'

    with app.app_context():
        listed = service.list_pc_agents({'keyword': 'LAB-PC-77'}, app=app)
        assert listed['total'] >= 1


def test_pc_agent_list_hostname_sort(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        admin = UserProfile(
            emp_no='PCSORTADM',
            name='PC Sort Admin',
            role='ADMIN',
            department='IT',
            email='pc-sort@example.com',
        )
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
        actor = {'user_id': admin_id, 'emp_no': admin.emp_no, 'name': admin.name, 'role': admin.role}
        base = {'service_status': 'RUNNING', 'heartbeat': True}
        service.upsert_pc_agent(dict(base, agent_id='sort-agent-b', hostname='zebra-host'), actor=actor, app=app)
        service.upsert_pc_agent(dict(base, agent_id='sort-agent-a', hostname='alpha-host'), actor=actor, app=app)
        asc = service.list_pc_agents({'sort': 'hostname', 'order': 'asc'}, page=1, page_size=20, app=app)
        desc = service.list_pc_agents({'sort': 'hostname', 'order': 'desc'}, page=1, page_size=20, app=app)
        h_asc = [r.get('hostname') for r in asc['rows']]
        h_desc = [r.get('hostname') for r in desc['rows']]
        assert h_asc.index('alpha-host') < h_asc.index('zebra-host')
        assert h_desc.index('zebra-host') < h_desc.index('alpha-host')