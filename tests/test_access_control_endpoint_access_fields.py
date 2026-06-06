import pytest

from app.services import web_access_control_service as service


def _seed_work_operation(app, code='OPS_APP', name='서비스 운영'):
    with service._get_connection(app) as conn:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {service.WORK_OPERATION_TABLE} (
                operation_code TEXT PRIMARY KEY,
                operation_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL,
                updated_at TEXT,
                updated_by TEXT,
                is_deleted INTEGER NOT NULL DEFAULT 0
            )
            '''
        )
        columns = {row[1] for row in conn.execute(f'PRAGMA table_info({service.WORK_OPERATION_TABLE})').fetchall()}
        values = {
            'operation_code': code,
            'operation_name': name,
            'description': '',
            'hw_count': 0,
            'sw_count': 0,
            'remark': '',
            'created_at': '2026-01-01 00:00:00',
            'created_by': 'pytest',
            'updated_at': '2026-01-01 00:00:00',
            'updated_by': 'pytest',
            'is_deleted': 0,
        }
        insert_columns = [col for col in values if col in columns]
        placeholders = ', '.join('?' for _ in insert_columns)
        conn.execute(
            f"INSERT OR REPLACE INTO {service.WORK_OPERATION_TABLE} ({', '.join(insert_columns)}) VALUES ({placeholders})",
            [values[col] for col in insert_columns],
        )
        conn.commit()
    return code, name


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


def test_resource_category_detail_is_stored_normalized_and_cleared(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        item = service.create_resource(
            {
                'resource_name': 'CATEGORY-DETAIL-TEST',
                'category': '관리 콘솔',
                'category_detail': 'storage',
                'endpoints': [
                    {
                        'label': '관리 웹',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'category.example.com',
                        'port': 443,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )

        with service._get_connection(app) as conn:
            resource_columns = {row[1] for row in conn.execute(f'PRAGMA table_info({service.RESOURCE_TABLE})').fetchall()}

        assert 'category_detail' in resource_columns
        assert item['category_name'] == '관리콘솔'
        assert item['category_detail'] == '스토리지'
        assert item['category_path'] == '관리콘솔 / 스토리지'

        listed = next(row for row in service.list_resources(app=app) if row['id'] == item['id'])
        assert listed['category_name'] == '관리콘솔'
        assert listed['category_detail'] == '스토리지'
        assert listed['category_path'] == '관리콘솔 / 스토리지'

        updated = service.update_resource(
            item['id'],
            {
                'category': '서비스',
                'category_detail': '서버',
                'resource_name': 'CATEGORY-DETAIL-TEST',
                'endpoints': item['endpoints'],
            },
            'pytest',
            app,
        )
        assert updated['category_name'] == '서비스'
        assert updated['category_detail'] == ''
        assert updated['category_path'] == '서비스'

        updated_again = service.update_resource(
            item['id'],
            {
                'category': '관리콘솔',
                'category_detail': 'SAN',
                'resource_name': 'CATEGORY-DETAIL-TEST',
                'endpoints': updated['endpoints'],
            },
            'pytest',
            app,
        )
        assert updated_again['category_name'] == '관리콘솔'
        assert updated_again['category_detail'] == 'SAN'
        assert updated_again['category_path'] == '관리콘솔 / SAN'


def test_resource_work_operation_is_stored_exposed_and_cleared_for_console(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        code, name = _seed_work_operation(app)
        item = service.create_resource(
            {
                'resource_name': 'WORK-OPERATION-RESOURCE-TEST',
                'category': '시스템',
                'work_operation_code': code,
                'endpoints': [
                    {
                        'label': '운영 SSH',
                        'kind': 'SSH',
                        'protocol': 'SSH',
                        'host': '10.10.0.21',
                        'port': 22,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )

        with service._get_connection(app) as conn:
            resource_columns = {row[1] for row in conn.execute(f'PRAGMA table_info({service.RESOURCE_TABLE})').fetchall()}

        assert 'work_operation_code' in resource_columns
        assert item['category_name'] == '시스템'
        assert item['work_operation_code'] == code
        assert item['work_operation_name'] == name
        assert item['work_operation'] == name

        listed = next(row for row in service.list_resources(app=app) if row['id'] == item['id'])
        assert listed['work_operation_code'] == code
        assert listed['work_operation_name'] == name

        updated = service.update_resource(
            item['id'],
            {
                'resource_name': 'WORK-OPERATION-RESOURCE-TEST',
                'category': '관리콘솔',
                'category_detail': '서버',
                'work_operation_code': code,
                'endpoints': item['endpoints'],
            },
            'pytest',
            app,
        )
        assert updated['category_name'] == '관리콘솔'
        assert updated['category_detail'] == '서버'
        assert updated['work_operation_code'] == ''
        assert updated['work_operation_name'] == ''


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


def test_audit_logs_filter_by_management_console_category_detail(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        console_item = service.create_resource(
            {
                'resource_name': 'AUDIT-CONSOLE-CATEGORY-TEST',
                'category': '관리콘솔',
                'category_detail': '서버',
                'endpoints': [
                    {
                        'label': '콘솔',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'console-category.example.com',
                        'port': 443,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )
        service_item = service.create_resource(
            {
                'resource_name': 'AUDIT-SERVICE-CATEGORY-TEST',
                'category': '서비스',
                'endpoints': [
                    {
                        'label': '서비스',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'service-category.example.com',
                        'port': 443,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )
        actor = {'user_id': 7011, 'emp_no': 'CAT001', 'name': 'Category Audit'}

        with service._get_connection(app) as conn:
            for resource_id in (console_item['id'], service_item['id']):
                conn.execute(
                    f'''
                    INSERT INTO {service.GRANT_TABLE}
                        (resource_id, user_id, grant_status, grant_start_date, grant_end_date, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (resource_id, actor['user_id'], service.GRANT_STATUS_ACTIVE, '2000-01-01', '9999-12-31', 'pytest', 'pytest'),
                )
            conn.commit()

        service.touch_access(console_item['id'], actor['user_id'], actor, endpoint_id=console_item['endpoints'][0]['id'], app=app)
        service.touch_access(service_item['id'], actor['user_id'], actor, endpoint_id=service_item['endpoints'][0]['id'], app=app)

        result = service.list_audit_logs(
            {'audit_scope': 'access', 'category': '관리콘솔', 'category_detail': '서버'},
            app=app,
        )
        assert result['total'] == 1
        row = result['rows'][0]
        assert row['resource_name'] == 'AUDIT-CONSOLE-CATEGORY-TEST'
        assert row['category_name'] == '관리콘솔'
        assert row['category_detail'] == '서버'
        assert row['category_path'] == '관리콘솔 / 서버'


def test_audit_logs_filter_and_expose_work_operation(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        code_a, name_a = _seed_work_operation(app, 'OPS_CORE', '핵심 업무 운영')
        code_b, _name_b = _seed_work_operation(app, 'OPS_SUPPORT', '지원 업무 운영')
        resource_a = service.create_resource(
            {
                'resource_name': 'AUDIT-WORK-OP-A',
                'category': '서비스',
                'work_operation_code': code_a,
                'endpoints': [
                    {
                        'label': '서비스 A',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'work-op-a.example.com',
                        'port': 443,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )
        resource_b = service.create_resource(
            {
                'resource_name': 'AUDIT-WORK-OP-B',
                'category': '서비스',
                'work_operation_code': code_b,
                'endpoints': [
                    {
                        'label': '서비스 B',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'work-op-b.example.com',
                        'port': 443,
                        'is_primary': 1,
                    },
                ],
            },
            'pytest',
            app,
        )
        actor = {'user_id': 7021, 'emp_no': 'WOP001', 'name': 'Work Operation Audit'}

        with service._get_connection(app) as conn:
            for resource_id in (resource_a['id'], resource_b['id']):
                conn.execute(
                    f'''
                    INSERT INTO {service.GRANT_TABLE}
                        (resource_id, user_id, grant_status, grant_start_date, grant_end_date, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (resource_id, actor['user_id'], service.GRANT_STATUS_ACTIVE, '2000-01-01', '9999-12-31', 'pytest', 'pytest'),
                )
            conn.commit()

        service.touch_access(resource_a['id'], actor['user_id'], actor, endpoint_id=resource_a['endpoints'][0]['id'], app=app)
        service.touch_access(resource_b['id'], actor['user_id'], actor, endpoint_id=resource_b['endpoints'][0]['id'], app=app)

        result = service.list_audit_logs(
            {'audit_scope': 'access', 'category': '서비스', 'work_operation_code': code_a},
            app=app,
        )
        assert result['total'] == 1
        row = result['rows'][0]
        assert row['resource_name'] == 'AUDIT-WORK-OP-A'
        assert row['work_operation_code'] == code_a
        assert row['work_operation_name'] == name_a


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