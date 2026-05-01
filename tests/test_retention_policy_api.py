from datetime import datetime

from app.models import db, AuthUser, MsgMessage, MsgRoom, MsgRoomMember, UserProfile


def _admin_client(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['role'] = 'ADMIN'
    return client


def _user_client(app, emp_no):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['emp_no'] = emp_no
        sess['role'] = 'USER'
    return client


def test_admin_retention_policy_apply_existing_handles_sqlite_datetime_strings(app):
    with app.app_context():
        user = UserProfile(emp_no='RETADMIN', name='Retention Admin', department='IT')
        db.session.add(user)
        db.session.flush()
        room = MsgRoom(
            room_type='CHANNEL',
            room_name='retention-room',
            created_by_user_id=user.id,
            created_at=datetime(2024, 1, 2, 9, 30, 0),
            updated_at=datetime(2024, 1, 2, 10, 30, 0),
            updated_by_user_id=user.id,
        )
        db.session.add(room)
        db.session.commit()
        room_id = room.id

    client = _admin_client(app)
    response = client.put('/api/admin/retention-policies/CHANNEL', json={
        'enabled': True,
        'retention_seconds': 3600,
        'delete_attachments': True,
        'reset_on_new_activity': True,
        'apply_existing': True,
    }, headers={'X-Requested-With': 'XMLHttpRequest'})

    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert data['item']['room_type'] == 'CHANNEL'
    assert data['item']['retention_seconds'] == 3600

    with app.app_context():
        row = db.session.execute(db.text(
            "SELECT retention_enabled, retention_value, retention_unit, auto_delete_at "
            "FROM msg_room WHERE id=:room_id"
        ), {'room_id': room_id}).fetchone()
        assert row is not None
        assert row.retention_enabled == 1
        assert row.retention_value == 3600
        assert row.retention_unit == 'seconds'
        assert row.auto_delete_at is not None


def test_me_profile_includes_admin_metadata(app):
    with app.app_context():
        db.session.add(AuthUser(
            emp_no='RETADMIN2',
            password_hash='test',
            email='retadmin2@example.com',
            role='ADMIN',
        ))
        db.session.add(UserProfile(emp_no='RETADMIN2', name='Retention Admin', department='IT'))
        db.session.commit()

    client = app.test_client()
    with client.session_transaction() as sess:
        sess['emp_no'] = 'RETADMIN2'
        sess['role'] = 'ADMIN'

    response = client.get('/api/me/profile', headers={'X-Requested-With': 'XMLHttpRequest'})

    assert response.status_code == 200
    item = response.get_json()['item']
    assert item['role'] == 'ADMIN'
    assert item['role_name'] == '관리자'
    assert item['is_admin'] is True
    assert item['admin'] is True


def test_user_retention_policy_applies_only_to_own_rooms(app):
    with app.app_context():
        user_a = UserProfile(emp_no='RETUSERA', name='Retention User A', department='IT')
        user_b = UserProfile(emp_no='RETUSERB', name='Retention User B', department='IT')
        user_c = UserProfile(emp_no='RETUSERC', name='Retention User C', department='IT')
        db.session.add_all([user_a, user_b, user_c])
        db.session.flush()
        room_owned = MsgRoom(
            room_type='GROUP',
            room_name='own group',
            created_by_user_id=user_a.id,
            created_at=datetime(2024, 1, 2, 9, 0, 0),
            updated_at=datetime(2024, 1, 2, 10, 0, 0),
        )
        room_other = MsgRoom(
            room_type='GROUP',
            room_name='other group',
            created_by_user_id=user_b.id,
            created_at=datetime(2024, 1, 2, 9, 0, 0),
            updated_at=datetime(2024, 1, 2, 10, 0, 0),
        )
        db.session.add_all([room_owned, room_other])
        db.session.flush()
        db.session.add_all([
            MsgRoomMember(room_id=room_owned.id, user_id=user_a.id, joined_at=datetime(2024, 1, 2, 8, 0, 0)),
            MsgRoomMember(room_id=room_owned.id, user_id=user_b.id, joined_at=datetime(2024, 1, 2, 8, 0, 0)),
            MsgRoomMember(room_id=room_other.id, user_id=user_b.id, joined_at=datetime(2024, 1, 2, 8, 0, 0)),
            MsgRoomMember(room_id=room_other.id, user_id=user_c.id, joined_at=datetime(2024, 1, 2, 8, 0, 0)),
        ])
        db.session.commit()
        room_owned_id = room_owned.id
        room_other_id = room_other.id

    client = _user_client(app, 'RETUSERA')
    response = client.put('/api/retention-policies/GROUP', json={
        'enabled': True,
        'retention_seconds': 3600,
        'apply_existing': True,
    }, headers={'X-Requested-With': 'XMLHttpRequest'})

    assert response.status_code == 200
    data = response.get_json()
    assert data['scope'] == 'USER'
    assert data['item']['scope_type'] == 'USER_ROOM_TYPE'

    with app.app_context():
        own_state = db.session.execute(db.text(
            "SELECT retention_enabled, retention_value, retention_auto_delete_at "
            "FROM msg_user_room_state WHERE user_id=:uid AND room_id=:rid"
        ), {'uid': UserProfile.query.filter_by(emp_no='RETUSERA').first().id, 'rid': room_owned_id}).fetchone()
        other_state = db.session.execute(db.text(
            "SELECT 1 FROM msg_user_room_state WHERE user_id=:uid AND room_id=:rid"
        ), {'uid': UserProfile.query.filter_by(emp_no='RETUSERA').first().id, 'rid': room_other_id}).fetchone()
        room_row = db.session.execute(db.text(
            "SELECT COALESCE(retention_enabled, 0) AS retention_enabled FROM msg_room WHERE id=:rid"
        ), {'rid': room_owned_id}).fetchone()
        assert own_state is not None
        assert own_state.retention_enabled == 1
        assert own_state.retention_value == 3600
        assert own_state.retention_auto_delete_at is not None
        assert other_state is None
        assert room_row.retention_enabled == 0


def test_user_retention_cleanup_hides_only_that_users_history(app):
    with app.app_context():
        user_a = UserProfile(emp_no='RETUSERD', name='Retention User D', department='IT')
        user_b = UserProfile(emp_no='RETUSERE', name='Retention User E', department='IT')
        db.session.add_all([user_a, user_b])
        db.session.flush()
        room = MsgRoom(
            room_type='GROUP',
            room_name='cleanup group',
            created_by_user_id=user_a.id,
            created_at=datetime(2024, 1, 2, 9, 0, 0),
            updated_at=datetime(2024, 1, 2, 10, 0, 0),
        )
        db.session.add(room)
        db.session.flush()
        db.session.add_all([
            MsgRoomMember(room_id=room.id, user_id=user_a.id, joined_at=datetime(2024, 1, 2, 8, 0, 0)),
            MsgRoomMember(room_id=room.id, user_id=user_b.id, joined_at=datetime(2024, 1, 2, 8, 0, 0)),
            MsgMessage(
                room_id=room.id,
                sender_user_id=user_a.id,
                content_type='TEXT',
                content_text='old message',
                created_at=datetime(2024, 1, 2, 10, 0, 0),
            ),
        ])
        db.session.commit()
        room_id = room.id
        user_a_id = user_a.id
        user_b_id = user_b.id

    client = _user_client(app, 'RETUSERD')
    save_response = client.put('/api/retention-policies/GROUP', json={
        'enabled': True,
        'retention_seconds': 60,
        'apply_existing': True,
    }, headers={'X-Requested-With': 'XMLHttpRequest'})
    assert save_response.status_code == 200

    cleanup_response = client.post('/api/system/retention-cleanup', json={'limit': 100}, headers={'X-Requested-With': 'XMLHttpRequest'})

    assert cleanup_response.status_code == 200
    result = cleanup_response.get_json()['result']
    assert result['scope'] == 'USER'
    assert result['rooms'] == 1
    assert result['messages'] == 0

    with app.app_context():
        user_state = db.session.execute(db.text(
            "SELECT hidden, local_deleted_at FROM msg_user_room_state WHERE user_id=:uid AND room_id=:rid"
        ), {'uid': user_a_id, 'rid': room_id}).fetchone()
        other_state = db.session.execute(db.text(
            "SELECT local_deleted_at FROM msg_user_room_state WHERE user_id=:uid AND room_id=:rid"
        ), {'uid': user_b_id, 'rid': room_id}).fetchone()
        message_row = db.session.execute(db.text(
            "SELECT is_deleted FROM msg_message WHERE room_id=:rid"
        ), {'rid': room_id}).fetchone()
        assert user_state.hidden == 1
        assert user_state.local_deleted_at is not None
        assert other_state is None
        assert message_row.is_deleted == 0
