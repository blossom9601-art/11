import pytest


def test_memo_can_move_between_groups(app, authed_client):
    from app.models import AuthUser, db

    # Memo APIs authenticate via AuthUser.id or session emp_no -> AuthUser
    with app.app_context():
        if not AuthUser.query.filter_by(emp_no='ACTOR001').first():
            db.session.add(AuthUser(emp_no='ACTOR001', password_hash='test'))
            db.session.commit()

    # Ensure default group exists
    res = authed_client.get('/api/memo/groups')
    assert res.status_code == 200
    data = res.get_json()
    assert data['success'] is True

    # Create two groups
    res = authed_client.post('/api/memo/groups', json={'name': '그룹A'})
    assert res.status_code == 200
    g1 = res.get_json()['item']

    res = authed_client.post('/api/memo/groups', json={'name': '그룹B'})
    assert res.status_code == 200
    g2 = res.get_json()['item']

    # Create a memo in group A
    res = authed_client.post(f"/api/memo/groups/{g1['id']}/memos", json={'title': 't', 'body': 'b'})
    assert res.status_code == 200
    memo = res.get_json()['item']
    assert memo['group_id'] == g1['id']

    # Move memo to group B
    res = authed_client.put(f"/api/memo/memos/{memo['id']}", json={'group_id': g2['id']})
    assert res.status_code == 200
    moved = res.get_json()['item']
    assert moved['group_id'] == g2['id']

    # Group A should no longer list it
    res = authed_client.get(f"/api/memo/groups/{g1['id']}/memos")
    assert res.status_code == 200
    items_a = res.get_json().get('items') or []
    assert all(int(x['id']) != int(memo['id']) for x in items_a)

    # Group B should list it
    res = authed_client.get(f"/api/memo/groups/{g2['id']}/memos")
    assert res.status_code == 200
    items_b = res.get_json().get('items') or []
    assert any(int(x['id']) == int(memo['id']) for x in items_b)


def test_memo_can_reorder_within_group(app, authed_client):
    from app.models import AuthUser, db

    with app.app_context():
        if not AuthUser.query.filter_by(emp_no='ACTOR001').first():
            db.session.add(AuthUser(emp_no='ACTOR001', password_hash='test'))
            db.session.commit()

    # Create a group
    res = authed_client.post('/api/memo/groups', json={'name': '정렬그룹'})
    assert res.status_code == 200
    gid = res.get_json()['item']['id']

    # Create 3 memos (will be appended in sort_order)
    ids = []
    for t in ['A', 'B', 'C']:
        r = authed_client.post(f"/api/memo/groups/{gid}/memos", json={'title': t, 'body': t})
        assert r.status_code == 200
        ids.append(r.get_json()['item']['id'])

    # Reorder: move C before A
    res = authed_client.post(f"/api/memo/groups/{gid}/memos/reorder", json={
        'source_id': ids[2],
        'target_id': ids[0],
        'position': 'before',
    })
    assert res.status_code == 200

    # List with custom sort and ensure order is C, A, B
    res = authed_client.get(f"/api/memo/groups/{gid}/memos?sort=custom&page=1&page_size=9")
    assert res.status_code == 200
    got = [x['id'] for x in (res.get_json().get('items') or [])]
    assert got[:3] == [ids[2], ids[0], ids[1]]


def test_memo_groups_can_reorder(app, authed_client):
    from app.models import AuthUser, db

    with app.app_context():
        if not AuthUser.query.filter_by(emp_no='ACTOR001').first():
            db.session.add(AuthUser(emp_no='ACTOR001', password_hash='test'))
            db.session.commit()

    # Ensure default group exists
    res = authed_client.get('/api/memo/groups')
    assert res.status_code == 200
    data = res.get_json()
    assert data['success'] is True

    # Create three groups (will be appended by sort_order)
    names = ['G-A', 'G-B', 'G-C']
    created = []
    for n in names:
        r = authed_client.post('/api/memo/groups', json={'name': n})
        assert r.status_code == 200
        created.append(r.get_json()['item'])

    g_a, g_b, g_c = created

    # Reorder: move C before A
    res = authed_client.post('/api/memo/groups/reorder', json={
        'source_id': g_c['id'],
        'target_id': g_a['id'],
        'position': 'before',
    })
    assert res.status_code == 200
    assert res.get_json()['success'] is True

    # Verify order from list endpoint: default first, then C, A, B
    res = authed_client.get('/api/memo/groups')
    assert res.status_code == 200
    items = res.get_json().get('items') or []
    non_default = [x for x in items if str(x.get('name', '')).strip() != '기본보기']
    got_names = [x.get('name') for x in non_default[:3]]
    assert got_names == ['G-C', 'G-A', 'G-B']


def test_memo_policy_limits(app, authed_client):
    """Policy:
    - max memo groups per user: 11 (including default)
    - max memos per group: 50

    Seed DB directly for speed, then verify API rejects overflows.
    """
    from datetime import datetime

    from app.models import AuthUser, UserMemo, UserMemoGroup, db

    with app.app_context():
        user = AuthUser.query.filter_by(emp_no='ACTOR001').first()
        if not user:
            user = AuthUser(emp_no='ACTOR001', password_hash='test')
            db.session.add(user)
            db.session.commit()

    # Ensure default group exists and limits are reported
    res = authed_client.get('/api/memo/groups')
    assert res.status_code == 200
    data = res.get_json()
    assert data['success'] is True
    assert data.get('limits', {}).get('max_groups') == 11

    with app.app_context():
        user = AuthUser.query.filter_by(emp_no='ACTOR001').first()
        assert user

        # Seed groups up to the limit (11 total including default)
        default = (
            UserMemoGroup.query
            .filter(UserMemoGroup.owner_user_id == user.id)
            .filter(UserMemoGroup.is_deleted == 0)
            .filter(db.func.trim(UserMemoGroup.name) == '기본보기')
            .first()
        )
        assert default

        existing = (
            UserMemoGroup.query
            .filter(UserMemoGroup.owner_user_id == user.id)
            .filter(UserMemoGroup.is_deleted == 0)
            .count()
        )
        need = max(0, 11 - int(existing or 0))
        for i in range(need):
            db.session.add(UserMemoGroup(owner_user_id=user.id, name=f'G{i+1}', sort_order=i + 1))
        db.session.commit()

        total_now = (
            UserMemoGroup.query
            .filter(UserMemoGroup.owner_user_id == user.id)
            .filter(UserMemoGroup.is_deleted == 0)
            .count()
        )
        assert int(total_now or 0) == 11

        # Create a group for memo-limit test (soft-delete one group to make room)
        victim = (
            UserMemoGroup.query
            .filter(UserMemoGroup.owner_user_id == user.id)
            .filter(UserMemoGroup.is_deleted == 0)
            .filter(db.func.trim(UserMemoGroup.name) != '기본보기')
            .order_by(UserMemoGroup.id.desc())
            .first()
        )
        assert victim
        victim.is_deleted = 1
        db.session.add(victim)
        db.session.commit()

        grp = UserMemoGroup(owner_user_id=user.id, name='LIMIT-GRP', sort_order=999)
        db.session.add(grp)
        db.session.commit()

        now_iso = datetime.utcnow().isoformat(timespec='seconds')
        db.session.bulk_save_objects([
            UserMemo(
                group_id=grp.id,
                owner_user_id=user.id,
                title=f't{i}',
                body=f'b{i}',
                sort_order=i + 1,
                updated_at=now_iso,
                is_deleted=0,
            )
            for i in range(50)
        ])
        db.session.commit()

    # Over-group should be rejected
    r = authed_client.post('/api/memo/groups', json={'name': 'OVER-GRP'})
    assert r.status_code == 400
    assert r.get_json()['success'] is False

    # Over-memo should be rejected
    with app.app_context():
        gid = UserMemoGroup.query.filter_by(name='LIMIT-GRP').first().id
    r = authed_client.post(f"/api/memo/groups/{gid}/memos", json={'title': 'overflow', 'body': 'overflow'})
    assert r.status_code == 400
    assert r.get_json()['success'] is False


def test_memo_body_max_10mb(app, authed_client):
    from app.models import AuthUser, UserMemoGroup, db

    with app.app_context():
        if not AuthUser.query.filter_by(emp_no='ACTOR001').first():
            db.session.add(AuthUser(emp_no='ACTOR001', password_hash='test'))
            db.session.commit()

    # Create a group
    res = authed_client.post('/api/memo/groups', json={'name': 'SIZE-GRP'})
    assert res.status_code == 200
    gid = res.get_json()['item']['id']

    # Body just over 10MB should be rejected
    too_big = 'a' * (10 * 1024 * 1024 + 1)
    r = authed_client.post(f"/api/memo/groups/{gid}/memos", json={'title': 'big', 'body': too_big})
    assert r.status_code == 400
    assert r.get_json()['success'] is False

    # Body exactly 10MB should be accepted
    ok = 'a' * (10 * 1024 * 1024)
    r = authed_client.post(f"/api/memo/groups/{gid}/memos", json={'title': 'ok', 'body': ok})
    assert r.status_code == 200
    memo = r.get_json()['item']

    # Updating to over 10MB should be rejected
    r = authed_client.put(f"/api/memo/memos/{memo['id']}", json={'body': too_big})
    assert r.status_code == 400
    assert r.get_json()['success'] is False
