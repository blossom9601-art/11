def test_login_force_clears_existing_session(client):
    with client.session_transaction() as sess:
        sess['user_id'] = 123
        sess['emp_no'] = 'USER001'
        sess['role'] = 'user'
        sess['_session_id'] = 'active-session-id'

    response = client.get('/login?force=1')

    assert response.status_code == 302
    assert response.headers['Location'].endswith('/login')
    assert 'force=1' not in response.headers['Location']
    with client.session_transaction() as sess:
        assert 'user_id' not in sess
        assert 'emp_no' not in sess
        assert 'role' not in sess
        assert '_session_id' not in sess


def test_login_reason_query_is_stripped(client):
    response = client.get('/login?reason=session-expired')

    assert response.status_code == 302
    assert response.headers['Location'].endswith('/login')
    assert 'reason=' not in response.headers['Location']
