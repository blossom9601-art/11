from datetime import datetime
import io
import os
import shutil

from sqlalchemy import text

from app.models import db, UserProfile


def _insert_department(code: str = 'OPS', name: str = '운영팀') -> int:
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    db.session.execute(
        text(
            """
            INSERT INTO org_department (
                dept_code, dept_name, description, manager_name, manager_emp_no,
                member_count, hw_count, sw_count, remark, parent_dept_code,
                created_at, created_by, updated_at, updated_by, is_deleted
            ) VALUES (:code, :name, NULL, NULL, NULL, 0, 0, 0, NULL, NULL, :ts, :actor, :ts, :actor, 0)
            """
        ),
        {'code': code, 'name': name, 'ts': timestamp, 'actor': 'pytest'},
    )
    db.session.commit()
    return db.session.execute(text('SELECT id FROM org_department WHERE dept_code = :code'), {'code': code}).scalar()


def _make_user(emp_no: str, name: str) -> UserProfile:
    user = UserProfile(emp_no=emp_no, name=name)
    db.session.add(user)
    db.session.commit()
    return user


def test_calendar_schedule_visibility_department_and_select(app, client):
    with app.app_context():
        ops_dept_id = _insert_department(code='OPS', name='운영팀')
        dev_dept_id = _insert_department(code='DEV', name='개발팀')
        owner = UserProfile(emp_no='EMP010', name='소유자', department='OPS', department_id=ops_dept_id)
        same_dept = UserProfile(emp_no='EMP011', name='같은부서', department='OPS', department_id=ops_dept_id)
        other_dept = UserProfile(emp_no='EMP012', name='다른부서', department='DEV', department_id=dev_dept_id)
        db.session.add_all([owner, same_dept, other_dept])
        db.session.commit()
        owner_id = owner.id
        same_dept_id = same_dept.id
        other_dept_id = other_dept.id

    with client.session_transaction() as session_tx:
        session_tx['user_id'] = owner_id
        session_tx['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()

    dept_payload = {
        'title': '부서 공유 일정',
        'start_datetime': '2025-12-10T10:00:00',
        'end_datetime': '2025-12-10T11:00:00',
        'is_all_day': False,
        'event_type': '미팅',
        'owner_user_id': owner_id,
        'share_scope': 'DEPARTMENT',
        'description': '부서 공유 테스트',
    }
    resp = client.post('/api/calendar/schedules', json=dept_payload)
    assert resp.status_code == 201
    dept_created = resp.get_json()['item']
    dept_schedule_id = dept_created['id']
    assert dept_created['owner_dept_id'] == ops_dept_id

    select_payload = {
        'title': '선택 공유 일정',
        'start_datetime': '2025-12-11T10:00:00',
        'end_datetime': '2025-12-11T11:00:00',
        'is_all_day': False,
        'event_type': '미팅',
        'owner_user_id': owner_id,
        'share_scope': 'SELECT',
        'share_users': [{'user_id': same_dept_id, 'can_edit': False, 'notification_enabled': True}],
    }
    resp = client.post('/api/calendar/schedules', json=select_payload)
    assert resp.status_code == 201
    select_schedule_id = resp.get_json()['item']['id']

    with client.session_transaction() as session_tx:
        session_tx['user_id'] = same_dept_id
        session_tx['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()
    resp = client.get('/api/calendar/schedules?start=2025-12-01&end=2025-12-31')
    assert resp.status_code == 200
    items = resp.get_json()['items']
    ids = {item['id'] for item in items}
    assert dept_schedule_id in ids
    assert select_schedule_id in ids
    # Same department user can view but should not be able to edit by default
    dept_item = next(item for item in items if item['id'] == dept_schedule_id)
    assert 'viewer_can_edit' in dept_item
    assert dept_item['viewer_can_edit'] is False
    select_item = next(item for item in items if item['id'] == select_schedule_id)
    assert 'viewer_can_edit' in select_item
    assert select_item['viewer_can_edit'] is False

    with client.session_transaction() as session_tx:
        session_tx['user_id'] = other_dept_id
        session_tx['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()
    resp = client.get('/api/calendar/schedules?start=2025-12-01&end=2025-12-31')
    assert resp.status_code == 200
    items = resp.get_json()['items']
    ids = {item['id'] for item in items}
    assert dept_schedule_id not in ids
    assert select_schedule_id not in ids


def test_calendar_schedule_full_crud_flow(app, client):
    with app.app_context():
        owner = _make_user('EMP001', '관리자')
        share_user = _make_user('EMP002', '공유 사용자')
        dept_id = _insert_department()
        owner_id = owner.id
        share_user_id = share_user.id

    with client.session_transaction() as session_tx:
        session_tx['user_id'] = owner_id
        session_tx['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()

    create_payload = {
        'title': '주간 미팅',
        'start_datetime': '2025-12-09T10:00:00',
        'end_datetime': '2025-12-09T11:00:00',
        'is_all_day': False,
        'location': '회의실 1',
        'event_type': '미팅',
        'owner_user_id': owner_id,
        'owner_dept_id': dept_id,
        'share_scope': 'SELECT',
        'description': '테스트 일정',
        'share_users': [
            {'user_id': share_user_id, 'can_edit': True, 'notification_enabled': False}
        ],
        'share_departments': [
            {'dept_id': dept_id, 'can_edit': False, 'notification_enabled': True}
        ],
        'color_code': '#123456',
    }

    resp = client.post('/api/calendar/schedules', json=create_payload)
    assert resp.status_code == 201
    created = resp.get_json()['item']
    schedule_id = created['id']
    assert created['owner_user_id'] == owner_id
    assert created.get('viewer_can_edit') is True
    assert created.get('viewer_can_delete') is True
    assert created.get('owner') is not None
    assert 'profile_image' in created['owner']
    assert len(created['share_users']) == 1
    assert created['share_users'][0]['user_id'] == share_user_id
    assert len(created['share_departments']) == 1
    assert created['share_departments'][0]['dept_id'] == dept_id

    resp = client.get(f'/api/calendar/schedules/{schedule_id}')
    assert resp.status_code == 200
    fetched = resp.get_json()['item']
    assert fetched.get('viewer_can_edit') is True
    assert fetched.get('viewer_can_delete') is True

    resp = client.get(f'/api/calendar/schedules?start=2025-12-01&end=2025-12-31')
    assert resp.status_code == 200
    items = resp.get_json()['items']
    assert any(item['id'] == schedule_id for item in items)
    item = next(item for item in items if item['id'] == schedule_id)
    assert item.get('viewer_can_edit') is True
    assert item.get('viewer_can_delete') is True

    update_payload = {
        'title': '일정 수정',
        'share_scope': 'ALL',
        'description': '설명 변경'
    }
    resp = client.put(f'/api/calendar/schedules/{schedule_id}', json=update_payload)
    assert resp.status_code == 200
    updated = resp.get_json()['item']
    assert updated['title'] == '일정 수정'
    assert updated['share_users'] == []

    resp = client.delete(f'/api/calendar/schedules/{schedule_id}')
    assert resp.status_code == 200

    resp = client.get(f'/api/calendar/schedules/{schedule_id}')
    assert resp.status_code == 404

    resp = client.get('/api/calendar/schedules?include_deleted=1')
    assert resp.status_code == 200
    deleted_items = resp.get_json()['items']
    deleted = next(item for item in deleted_items if item['id'] == schedule_id)
    assert deleted['is_deleted'] is True


def test_calendar_schedule_attachments_upload_persist_download(app, client):
    with app.app_context():
        owner = _make_user('EMP101', '첨부 소유자')
        dept_id = _insert_department(code='OPS2', name='운영2팀')
        owner_id = owner.id

    with client.session_transaction() as session_tx:
        session_tx['user_id'] = owner_id
        session_tx['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()

    create_payload = {
        'title': '첨부 일정',
        'start_datetime': '2025-12-12T10:00:00',
        'end_datetime': '2025-12-12T11:00:00',
        'is_all_day': False,
        'event_type': '미팅',
        'owner_user_id': owner_id,
        'owner_dept_id': dept_id,
        'share_scope': 'ALL',
        'description': '첨부 테스트',
    }
    resp = client.post('/api/calendar/schedules', json=create_payload)
    assert resp.status_code == 201
    schedule_id = resp.get_json()['item']['id']

    file_bytes = b'hello-attachment'
    data = {
        'files': (io.BytesIO(file_bytes), 'hello.txt'),
    }
    resp = client.post(
        f'/api/calendar/schedules/{schedule_id}/attachments',
        data=data,
        content_type='multipart/form-data',
    )
    assert resp.status_code in (200, 201)
    payload = resp.get_json()
    assert payload.get('success') is True
    assert payload.get('items')
    uploaded = payload['items'][0]
    assert uploaded['name'] == 'hello.txt'
    assert 'download_url' in uploaded

    resp = client.get(f'/api/calendar/schedules/{schedule_id}')
    assert resp.status_code == 200
    schedule = resp.get_json()['item']
    assert 'attachments' in schedule
    assert len(schedule['attachments']) == 1
    assert schedule['attachments'][0]['name'] == 'hello.txt'

    download_url = schedule['attachments'][0]['download_url']
    resp = client.get(download_url)
    assert resp.status_code == 200
    assert resp.data == file_bytes

    # Cleanup uploaded files on disk (keep tests hermetic)
    uploads_dir = os.path.join(app.instance_path, 'uploads', 'calendar', str(schedule_id))
    if os.path.exists(uploads_dir):
        shutil.rmtree(uploads_dir, ignore_errors=True)


def test_calendar_schedule_attachments_delete(app, client):
    with app.app_context():
        owner = _make_user('EMP201', '삭제 소유자')
        dept_id = _insert_department(code='DEL', name='삭제팀')
        owner_id = owner.id

    with client.session_transaction() as session_tx:
        session_tx['user_id'] = owner_id
        session_tx['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()

    # Create schedule
    resp = client.post(
        '/api/calendar/schedules',
        json={
            'title': '삭제 테스트',
            'start_datetime': '2025-12-14T10:00:00',
            'end_datetime': '2025-12-14T11:00:00',
            'is_all_day': False,
            'share_scope': 'ALL',
            'owner_user_id': owner_id,
            'owner_dept_id': dept_id,
        },
    )
    assert resp.status_code in (200, 201)
    schedule_id = resp.get_json()['item']['id']

    # Upload attachment
    file_bytes = b'hello-delete-attachment'
    data = {
        'files': (io.BytesIO(file_bytes), 'delete_me.txt'),
    }
    resp = client.post(
        f'/api/calendar/schedules/{schedule_id}/attachments',
        data=data,
        content_type='multipart/form-data',
    )
    assert resp.status_code in (200, 201)
    uploaded = resp.get_json()['items'][0]
    attachment_id = uploaded['id']
    download_url = uploaded['download_url']

    # Verify file exists via download
    resp = client.get(download_url)
    assert resp.status_code == 200
    assert resp.data == file_bytes

    # Delete attachment
    resp = client.delete(f'/api/calendar/schedules/{schedule_id}/attachments/{attachment_id}')
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload.get('success') is True

    # Download should 404
    resp = client.get(download_url)
    assert resp.status_code == 404

    # Schedule should have no attachments
    resp = client.get(f'/api/calendar/schedules/{schedule_id}')
    assert resp.status_code == 200
    schedule = resp.get_json()['item']
    assert 'attachments' in schedule
    assert schedule['attachments'] == []

    # Cleanup uploaded files on disk (keep tests hermetic)
    uploads_dir = os.path.join(app.instance_path, 'uploads', 'calendar', str(schedule_id))
    if os.path.exists(uploads_dir):
        shutil.rmtree(uploads_dir, ignore_errors=True)
