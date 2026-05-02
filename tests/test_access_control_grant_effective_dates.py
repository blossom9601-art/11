"""Grant 활성 판정: 날짜 컬럼에 시간 접미사가 있어도 접속 가능해야 한다."""

from datetime import date

from app.services import web_access_control_service as service


def test_has_active_grant_normalizes_datetime_suffixes(app):
    with app.app_context():
        service.init_web_access_control_tables(app)
        item = service.create_resource(
            {
                'resource_name': 'GRANT-DATE-TEST',
                'category': '내부 서비스',
                'endpoints': [
                    {
                        'label': 'SSH',
                        'kind': 'SSH',
                        'protocol': 'SSH',
                        'host': '10.0.0.5',
                        'port': 22,
                        'is_primary': 1,
                    }
                ],
            },
            'pytest',
            app,
        )
        uid = 88001
        with service._get_connection(app) as conn:
            conn.execute(
                f'''
                INSERT INTO {service.GRANT_TABLE}
                    (resource_id, user_id, grant_status,
                     grant_start_date, grant_end_date, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    item['id'],
                    uid,
                    service.GRANT_STATUS_ACTIVE,
                    '2000-01-01 00:00:00',
                    '9999-12-31 23:59:59',
                    'pytest',
                    'pytest',
                ),
            )
            conn.commit()

        assert service.has_active_grant(uid, item['id'], app) is True
        today = date.today().isoformat()
        assert service.grant_is_active_on_date(
            {
                'grant_status': service.GRANT_STATUS_ACTIVE,
                'grant_start_date': '2000-01-01 00:00:00',
                'grant_end_date': '9999-12-31 23:59:59',
            },
            today,
        )
