from datetime import datetime, timedelta

from app.models import db, MsgRoom, MsgRoomMember, MsgMessage, UserProfile


def seed_room_with_messages(app):
    with app.app_context():
        user_a = UserProfile(name='Alice', department='IT', email='alice@example.com', emp_no='1001')
        user_b = UserProfile(name='Bob', department='IT', email='bob@example.com', emp_no='1002')
        db.session.add_all([user_a, user_b])
        db.session.flush()

        room = MsgRoom(
            room_type='DIRECT',
            room_name='Direct Chat',
            direct_key=f'{min(user_a.id, user_b.id)}-{max(user_a.id, user_b.id)}',
            created_by_user_id=user_a.id,
            updated_by_user_id=user_a.id,
        )
        db.session.add(room)
        db.session.flush()

        base = datetime(2024, 1, 1, 12, 0, 0)

        # Ensure membership joined_at predates seeded messages so message gating
        # (created_at >= joined_at) does not hide test data.
        db.session.add_all([
            MsgRoomMember(room_id=room.id, user_id=user_a.id, joined_at=base - timedelta(seconds=5)),
            MsgRoomMember(room_id=room.id, user_id=user_b.id, joined_at=base - timedelta(seconds=5)),
        ])
        messages = []
        senders = [user_a.id, user_b.id, user_a.id]
        for idx, sender_id in enumerate(senders, start=1):
            messages.append(MsgMessage(
                room_id=room.id,
                sender_user_id=sender_id,
                content_type='TEXT',
                content_text=f'message-{idx}',
                created_at=base + timedelta(seconds=idx),
            ))
        db.session.add_all(messages)
        db.session.commit()
        return room.id


def test_chat_messages_default_order(client, app):
    room_id = seed_room_with_messages(app)
    with app.app_context():
        viewer_id = MsgRoomMember.query.filter_by(room_id=room_id).first().user_id
    resp = client.get(f'/api/chat/rooms/{room_id}/messages?viewer_user_id={viewer_id}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['order'] == 'asc'
    texts = [msg['content_text'] for msg in data['items']]
    assert texts == ['message-1', 'message-2', 'message-3']


def test_chat_messages_desc_order_returns_latest_first(client, app):
    room_id = seed_room_with_messages(app)
    with app.app_context():
        viewer_id = MsgRoomMember.query.filter_by(room_id=room_id).first().user_id
    resp = client.get(f'/api/chat/rooms/{room_id}/messages?viewer_user_id={viewer_id}&order=desc&per_page=2')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['order'] == 'desc'
    texts = [msg['content_text'] for msg in data['items']]
    assert texts == ['message-3', 'message-2']


def test_delete_chat_room_clears_history_on_revive(client, app):
    room_id = seed_room_with_messages(app)

    with app.app_context():
        room = MsgRoom.query.get(room_id)
        assert room is not None
        created_by = room.created_by_user_id
        member_ids = [m.user_id for m in MsgRoomMember.query.filter_by(room_id=room_id).all()]
        assert len(member_ids) == 2

    # Only the creator can delete.
    resp = client.delete(f'/api/chat/rooms/{room_id}?updated_by_user_id={created_by}')
    assert resp.status_code == 200

    with app.app_context():
        assert MsgRoom.query.filter_by(id=room_id).count() == 0
        assert MsgMessage.query.filter_by(room_id=room_id).count() == 0
        assert MsgRoomMember.query.filter_by(room_id=room_id).count() == 0

    # Recreate/revive the direct room
    resp = client.post('/api/chat/rooms', json={
        'room_type': 'DIRECT',
        'created_by_user_id': created_by,
        'member_ids': member_ids,
    })
    assert resp.status_code in (200, 201)
    room = resp.get_json()
    revived_room_id = room['id']

    # Messages should be empty after deletion.
    resp = client.get(f'/api/chat/rooms/{revived_room_id}/messages?viewer_user_id={created_by}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total'] == 0
    assert data['items'] == []


def test_delete_chat_room_forbidden_for_non_creator(client, app):
    room_id = seed_room_with_messages(app)
    with app.app_context():
        room = MsgRoom.query.get(room_id)
        assert room is not None
        member_ids = [m.user_id for m in MsgRoomMember.query.filter_by(room_id=room_id).all()]
        assert len(member_ids) == 2
        non_creator = next(uid for uid in member_ids if uid != room.created_by_user_id)

    resp = client.delete(f'/api/chat/rooms/{room_id}?updated_by_user_id={non_creator}')
    assert resp.status_code == 403


def test_leave_creates_system_message_and_hides_room_for_leaver(client, app):
    room_id = seed_room_with_messages(app)

    with app.app_context():
        room = MsgRoom.query.get(room_id)
        assert room is not None
        creator_id = room.created_by_user_id
        members = MsgRoomMember.query.filter_by(room_id=room_id).all()
        assert len(members) == 2
        leaver = next(m for m in members if m.user_id != creator_id)

    resp = client.delete(
        f'/api/chat/rooms/{room_id}/members/{leaver.id}?actor_user_id={leaver.user_id}'
    )
    assert resp.status_code == 200

    # Leaver should no longer see this room in their list.
    resp = client.get(f'/api/chat/rooms?user_id={leaver.user_id}')
    assert resp.status_code == 200
    rooms = resp.get_json()
    assert all(r['id'] != room_id for r in rooms)

    # Remaining member should see a system message about leaving.
    resp = client.get(f'/api/chat/rooms/{room_id}/messages?viewer_user_id={creator_id}&order=asc')
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(
        (msg.get('is_system') is True) and ('나갔습니다' in (msg.get('content_text') or ''))
        for msg in data['items']
    )


def test_leave_endpoint_leaves_current_user(client, app):
    room_id = seed_room_with_messages(app)

    with app.app_context():
        room = MsgRoom.query.get(room_id)
        assert room is not None
        creator_id = room.created_by_user_id
        members = MsgRoomMember.query.filter_by(room_id=room_id).all()
        assert len(members) == 2
        leaver = next(m for m in members if m.user_id != creator_id)

    resp = client.delete(f'/api/chat/rooms/{room_id}/leave?actor_user_id={leaver.user_id}')
    assert resp.status_code == 200
    payload = resp.get_json() or {}
    assert payload.get('status') in ('left', 'already_left', 'not_a_member')

    with app.app_context():
        leaver_member = MsgRoomMember.query.filter_by(room_id=room_id, user_id=leaver.user_id).first()
        assert leaver_member is not None
        assert leaver_member.left_at is not None

    # Leaver should no longer see this room in their list.
    resp = client.get(f'/api/chat/rooms?user_id={leaver.user_id}')
    assert resp.status_code == 200
    rooms = resp.get_json()
    assert all(r['id'] != room_id for r in rooms)

    # Remaining member should see a system message about leaving.
    resp = client.get(f'/api/chat/rooms/{room_id}/messages?viewer_user_id={creator_id}&order=asc')
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(
        (msg.get('is_system') is True) and ('나갔습니다' in (msg.get('content_text') or ''))
        for msg in data['items']
    )


def test_reinvite_makes_room_feel_new_for_invited_user(client, app):
    room_id = seed_room_with_messages(app)

    with app.app_context():
        room = MsgRoom.query.get(room_id)
        assert room is not None
        creator_id = room.created_by_user_id
        members = MsgRoomMember.query.filter_by(room_id=room_id).all()
        invited = next(m for m in members if m.user_id != creator_id)

    # Invited user leaves.
    resp = client.delete(
        f'/api/chat/rooms/{room_id}/members/{invited.id}?actor_user_id={invited.user_id}'
    )
    assert resp.status_code == 200

    # Creator re-invites the user.
    resp = client.post(f'/api/chat/rooms/{room_id}/members', json={
        'user_id': invited.user_id,
        'invited_by_user_id': creator_id,
    })
    assert resp.status_code in (200, 201)

    # User sees the room again.
    resp = client.get(f'/api/chat/rooms?user_id={invited.user_id}')
    assert resp.status_code == 200
    rooms = resp.get_json()
    assert any(r['id'] == room_id for r in rooms)

    # But message history should start fresh from re-join time.
    resp = client.get(f'/api/chat/rooms/{room_id}/messages?viewer_user_id={invited.user_id}&order=asc')
    assert resp.status_code == 200
    data = resp.get_json()
    texts = [msg.get('content_text') for msg in data['items']]
    assert 'message-1' not in texts
    assert 'message-2' not in texts
    assert 'message-3' not in texts


def test_creator_cannot_leave_room(client, app):
    room_id = seed_room_with_messages(app)
    with app.app_context():
        room = MsgRoom.query.get(room_id)
        assert room is not None
        creator_id = room.created_by_user_id
        creator_member = MsgRoomMember.query.filter_by(room_id=room_id, user_id=creator_id).first()
        assert creator_member is not None

    resp = client.delete(
        f'/api/chat/rooms/{room_id}/members/{creator_member.id}?actor_user_id={creator_id}'
    )
    assert resp.status_code == 403
