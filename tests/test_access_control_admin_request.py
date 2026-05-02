from app.models import UserProfile, db
from app.services import web_access_control_service as service


def test_admin_delete_request_uses_admin_as_approver_without_manager(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        admin = UserProfile(
            emp_no='ADMIN',
            name='Admin User',
            role='ADMIN',
            department='IT',
            email='admin@example.com',
        )
        db.session.add(admin)
        db.session.commit()

        resource = service.create_resource(
            {
                'resource_name': 'ADMIN-DELETE-RESOURCE',
                'category': '내부 서비스',
                'endpoints': [
                    {
                        'label': '관리 웹',
                        'kind': 'WEB',
                        'protocol': 'HTTPS',
                        'host': 'admin-delete.example.com',
                        'port': 443,
                        'is_primary': 1,
                    }
                ],
            },
            'pytest',
            app,
        )

        with service._get_connection(app) as conn:
            conn.execute(
                f'''
                INSERT INTO {service.GRANT_TABLE}
                    (resource_id, user_id, department_id, grant_status,
                     grant_start_date, grant_end_date, granted_by_user_id,
                     granted_by_emp_no, granted_by_name, approval_required,
                     created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    resource['id'],
                    admin.id,
                    admin.department_id,
                    service.GRANT_STATUS_ACTIVE,
                    '2026-01-01',
                    '9999-12-31',
                    admin.id,
                    'ADMIN',
                    'Admin User',
                    1,
                    'pytest',
                    'pytest',
                ),
            )
            conn.commit()

        request_item = service.create_request(
            {
                'request_type': 'delete',
                'resource_ids': [resource['id']],
                'reason': '관리자 권한 삭제 신청 사유입니다.',
            },
            {
                'user_id': admin.id,
                'emp_no': 'ADMIN',
                'name': 'Admin User',
                'role': 'ADMIN',
                'department_id': admin.department_id,
                'department_name': 'IT',
                'manager_emp_no': '',
            },
            app,
        )

        assert request_item['approver_emp_no'] == 'ADMIN'
        assert request_item['approver_name'] == 'Admin User'
        assert request_item['approvals'][0]['phase_name'] == '관리자 권한 삭제 승인'