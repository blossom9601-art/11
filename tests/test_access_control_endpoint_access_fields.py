import pytest

from app.services import web_access_control_service as service


def test_endpoint_access_type_and_info_are_stored_and_exposed(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        item = service.create_resource(
            {
                'resource_name': 'ACCESS-FIELD-TEST',
                'category': '내부 서비스',
                'endpoints': [
                    {
                        'label': '관리 웹',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'portal.example.com',
                        'port': 443,
                        'url_path': '/admin',
                        'is_primary': 1,
                    },
                    {
                        'label': '관리 SSH',
                        'kind': 'SSH',
                        'protocol': 'SSH',
                        'host': '10.0.0.15',
                        'port': 2222,
                    },
                ],
            },
            'pytest',
            app,
        )

        endpoint_columns = set()
        stored_values = []
        with service._get_connection(app) as conn:
            endpoint_columns = {row[1] for row in conn.execute(f'PRAGMA table_info({service.ENDPOINT_TABLE})').fetchall()}
            stored_values = [
                dict(row)
                for row in conn.execute(
                    f'''SELECT access_type, access_info
                          FROM {service.ENDPOINT_TABLE}
                         WHERE resource_id = ?
                         ORDER BY is_primary DESC, sort_order ASC, id ASC''',
                    (item['id'],),
                ).fetchall()
            ]

        assert {'access_type', 'access_info'} <= endpoint_columns
        assert stored_values == [
            {'access_type': 'WEB', 'access_info': 'https://portal.example.com/admin'},
            {'access_type': 'SSH', 'access_info': '10.0.0.15:2222'},
        ]

        endpoints = item['endpoints']
        assert endpoints[0]['access_type'] == 'WEB'
        assert endpoints[0]['access_info'] == 'https://portal.example.com/admin'
        assert endpoints[1]['access_type'] == 'SSH'
        assert endpoints[1]['access_info'] == '10.0.0.15:2222'

        listed = next(row for row in service.list_resources(app=app) if row['id'] == item['id'])
        assert listed['access_type'] == 'WEB'
        assert listed['access_info'] == 'https://portal.example.com/admin'
        assert listed['primary_access_type'] == 'WEB'
        assert listed['primary_access_info'] == 'https://portal.example.com/admin'


def test_audit_logs_store_and_expose_resource_name_and_access_info(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        item = service.create_resource(
            {
                'resource_name': 'AUDIT-ACCESS-FIELD-TEST',
                'category': '내부 서비스',
                'endpoints': [
                    {
                        'label': '관리 웹',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'audit.example.com',
                        'port': 443,
                        'is_primary': 1,
                    },
                    {
                        'label': '관리 SSH',
                        'kind': 'SSH',
                        'protocol': 'SSH',
                        'host': '10.0.0.15',
                        'port': 2222,
                    },
                ],
            },
            'pytest',
            app,
        )
        ssh_endpoint = next(endpoint for endpoint in item['endpoints'] if endpoint['kind'] == 'SSH')
        actor = {'user_id': 7001, 'emp_no': 'AUDITOR001', 'name': 'Audit Tester'}

        with service._get_connection(app) as conn:
            audit_columns = {row[1] for row in conn.execute(f'PRAGMA table_info({service.AUDIT_TABLE})').fetchall()}
            conn.execute(
                f'''
                INSERT INTO {service.GRANT_TABLE}
                    (resource_id, user_id, grant_status, grant_start_date, grant_end_date, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (item['id'], actor['user_id'], service.GRANT_STATUS_ACTIVE, '2000-01-01', '9999-12-31', 'pytest', 'pytest'),
            )
            conn.commit()

        assert {
            'target_endpoint_id',
            'resource_name',
            'access_type',
            'access_info',
            'connect_account',
            'session_ended_at',
        } <= audit_columns

        out = service.touch_access(item['id'], actor['user_id'], actor, ip_address='192.0.2.10', endpoint_id=ssh_endpoint['id'], app=app)
        assert out.get('audit_log_id')

        result = service.list_audit_logs({'audit_scope': 'access', 'keyword': '10.0.0.15:2222'}, app=app)
        assert result['total'] == 1
        row = result['rows'][0]
        assert row['resource_name'] == 'AUDIT-ACCESS-FIELD-TEST'
        assert row['target_endpoint_id'] == ssh_endpoint['id']
        assert row['endpoint_kind'] == 'SSH'
        assert row['access_type'] == 'SSH'
        assert row['access_info'] == '10.0.0.15:2222'
        assert row['action_result'] == service.AUDIT_ACCESS_OUTCOME_PENDING


def test_touch_web_access_audit_is_success_not_pending(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        item = service.create_resource(
            {
                'resource_name': 'AUDIT-WEB-PENDING-TEST',
                'category': '내부 서비스',
                'endpoints': [
                    {
                        'label': 'W',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'w.example.com',
                        'port': 443,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )
        web_ep = item['endpoints'][0]
        actor = {'user_id': 7002, 'emp_no': 'WEBAUD001', 'name': 'Web Audit'}
        with service._get_connection(app) as conn:
            conn.execute(
                f'''
                INSERT INTO {service.GRANT_TABLE}
                    (resource_id, user_id, grant_status, grant_start_date, grant_end_date, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (item['id'], actor['user_id'], service.GRANT_STATUS_ACTIVE, '2000-01-01', '9999-12-31', 'pytest', 'pytest'),
            )
            conn.commit()
        out = service.touch_access(item['id'], actor['user_id'], actor, endpoint_id=web_ep['id'], app=app)
        with service._get_connection(app) as conn:
            row = conn.execute(
                f'SELECT action_result FROM {service.AUDIT_TABLE} WHERE id = ?',
                (out['audit_log_id'],),
            ).fetchone()
        assert row['action_result'] == service.AUDIT_ACCESS_OUTCOME_SUCCESS


def test_touch_access_rate_limit_blocks_repeated_attempts_without_extra_audit(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        service.update_default_policy(
            {
                'access_click_cooldown_seconds': 1,
                'access_rate_limit_window_seconds': 60,
                'access_rate_limit_max_count': 1,
            },
            'pytest',
            app,
        )
        item = service.create_resource(
            {
                'resource_name': 'ACCESS-RATE-LIMIT-TEST',
                'category': '내부 서비스',
                'endpoints': [
                    {
                        'label': 'W',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'limit.example.com',
                        'port': 443,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )
        web_ep = item['endpoints'][0]
        actor = {'user_id': 7005, 'emp_no': 'LIMIT001', 'name': 'Limit Test'}
        with service._get_connection(app) as conn:
            conn.execute(
                f'''
                INSERT INTO {service.GRANT_TABLE}
                    (resource_id, user_id, grant_status, grant_start_date, grant_end_date, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (item['id'], actor['user_id'], service.GRANT_STATUS_ACTIVE, '2000-01-01', '9999-12-31', 'pytest', 'pytest'),
            )
            conn.commit()

        service.touch_access(item['id'], actor['user_id'], actor, endpoint_id=web_ep['id'], app=app)
        with pytest.raises(ValueError, match='접속 요청이 너무 잦습니다'):
            service.touch_access(item['id'], actor['user_id'], actor, endpoint_id=web_ep['id'], app=app)

        with service._get_connection(app) as conn:
            count = conn.execute(
                f'''
                SELECT COUNT(1) AS cnt
                  FROM {service.AUDIT_TABLE}
                 WHERE target_resource_id = ?
                   AND actor_user_id = ?
                   AND action_type = '접속'
                ''',
                (item['id'], actor['user_id']),
            ).fetchone()['cnt']
        assert count == 1


def test_complete_ssh_connection_outcome(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        item = service.create_resource(
            {
                'resource_name': 'SSH-OUTCOME-TEST',
                'category': '내부 서비스',
                'endpoints': [
                    {
                        'label': 'S',
                        'kind': 'SSH',
                        'protocol': 'SSH',
                        'host': '10.0.0.20',
                        'port': 22,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )
        ssh_ep = item['endpoints'][0]
        actor = {'user_id': 7003, 'emp_no': 'SSHFAIL01', 'name': 'SSH Fail Test'}
        with service._get_connection(app) as conn:
            conn.execute(
                f'''
                INSERT INTO {service.GRANT_TABLE}
                    (resource_id, user_id, grant_status, grant_start_date, grant_end_date, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (item['id'], actor['user_id'], service.GRANT_STATUS_ACTIVE, '2000-01-01', '9999-12-31', 'pytest', 'pytest'),
            )
            conn.commit()
        out = service.touch_access(item['id'], actor['user_id'], actor, endpoint_id=ssh_ep['id'], app=app)
        aid = out['audit_log_id']
        assert service.complete_audit_connection_outcome(aid, actor['user_id'], False, '비밀번호 오류', app=app)
        with service._get_connection(app) as conn:
            row = conn.execute(
                f'SELECT action_result, note FROM {service.AUDIT_TABLE} WHERE id = ?',
                (aid,),
            ).fetchone()
        assert row['action_result'] == service.AUDIT_ACCESS_OUTCOME_FAIL
        assert '비밀번호' in row['note']
        assert service.complete_audit_connection_outcome(aid, actor['user_id'], True, app=app)
        with service._get_connection(app) as conn:
            row2 = conn.execute(
                f'SELECT action_result FROM {service.AUDIT_TABLE} WHERE id = ?',
                (aid,),
            ).fetchone()
        assert row2['action_result'] == service.AUDIT_ACCESS_OUTCOME_FAIL


def test_ssh_command_history_is_recorded_and_counted(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        item = service.create_resource(
            {
                'resource_name': 'SSH-COMMAND-HISTORY-TEST',
                'category': '내부 서비스',
                'endpoints': [
                    {
                        'label': 'S',
                        'kind': 'SSH',
                        'protocol': 'SSH',
                        'host': '10.0.0.30',
                        'port': 22,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )
        ssh_ep = item['endpoints'][0]
        actor = {'user_id': 7004, 'emp_no': 'SSHCMD01', 'name': 'SSH Command Test'}
        with service._get_connection(app) as conn:
            conn.execute(
                f'''
                INSERT INTO {service.GRANT_TABLE}
                    (resource_id, user_id, grant_status, grant_start_date, grant_end_date, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (item['id'], actor['user_id'], service.GRANT_STATUS_ACTIVE, '2000-01-01', '9999-12-31', 'pytest', 'pytest'),
            )
            conn.commit()

        out = service.touch_access(item['id'], actor['user_id'], actor, endpoint_id=ssh_ep['id'], app=app)
        aid = out['audit_log_id']
        recorded = service.record_ssh_command_events(
            {
                'audit_log_id': aid,
                'agent_id': 'pc-agent-cmd-1',
                'events': [
                    {'occurred_at': '2026-05-04T10:11:12', 'command': 'whoami'},
                    {'occurred_at': '2026-05-04 10:12:13', 'command': 'sudo systemctl status nginx'},
                ],
            },
            app=app,
        )
        assert recorded['inserted'] == 2

        history = service.list_ssh_command_history(aid, app=app)
        assert history['total'] == 2
        assert [row['command_text'] for row in history['rows']] == ['whoami', 'sudo systemctl status nginx']

        listed = service.list_audit_logs({'audit_scope': 'access', 'keyword': 'SSH-COMMAND-HISTORY-TEST'}, app=app)
        assert listed['total'] == 1
        assert listed['rows'][0]['activity_count'] == 2