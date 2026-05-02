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