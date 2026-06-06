def test_heartbeat_accepts_profile_only_session(app, actor_user_id):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['user_profile_id'] = actor_user_id

    response = client.get('/api/session/heartbeat', headers={'X-Requested-With': 'XMLHttpRequest'})

    assert response.status_code == 200
    assert response.get_json()['alive'] is True


def test_legacy_user_session_bootstraps_expiry_metadata(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['user_id'] = 1
        sess['role'] = 'ADMIN'

    response = client.get('/api/session/heartbeat', headers={'X-Requested-With': 'XMLHttpRequest'})

    assert response.status_code == 200
    with client.session_transaction() as sess:
        assert sess.get('_login_at')
        assert sess.get('_last_active')


def test_legacy_permission_payload_is_removed_from_cookie_session(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['user_id'] = 1
        sess['role'] = 'ADMIN'
        sess['_perms'] = {f'menu.{idx}': f'WRITE-{idx}-payload' for idx in range(160)}

    response = client.get('/api/session/heartbeat', headers={'X-Requested-With': 'XMLHttpRequest'})

    assert response.status_code == 200
    assert len(response.headers.get('Set-Cookie', '')) < 2000
    with client.session_transaction() as sess:
        assert '_perms' not in sess


def test_detail_context_does_not_accumulate_in_session_cookie(app, actor_user_id):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['emp_no'] = 'ACTOR001'
        sess['user_profile_id'] = actor_user_id
        sess['cat_detail_ctx_v1'] = {
            f'legacy_{idx}': {'id': str(idx), 'title': f'old-{idx}', 'subtitle': 'old'}
            for idx in range(80)
        }

    response = client.post('/api/category/detail-context', json={
        'key': 'cat_hw_server_detail',
        'id': '42',
        'title': '상세 서버',
        'subtitle': '제조사',
    })

    assert response.status_code == 200
    assert len(response.headers.get('Set-Cookie', '')) < 2000
    with client.session_transaction() as sess:
        assert list(sess.get('cat_detail_ctx_v1', {}).keys()) == ['cat_hw_server']
