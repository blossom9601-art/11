from datetime import datetime


def _auth_session(client):
    with client.session_transaction() as sess:
        sess['user_id'] = 1
        sess['emp_no'] = 'ACTOR001'
        sess['role'] = 'ADMIN'
        now = datetime.utcnow().isoformat()
        sess['_login_at'] = now
        sess['_last_active'] = now


def test_unified_search_returns_briefing(client):
    _auth_session(client)

    response = client.get('/api/search/unified', query_string={'q': '서버', 'limit': 10})
    assert response.status_code == 200

    payload = response.get_json()
    assert payload['success'] is True
    assert 'briefing' in payload
    assert payload['briefing']['title'] == '검색 안내'
    assert isinstance(payload['briefing']['summary_lines'], list)


def test_unified_search_can_disable_briefing(client):
    _auth_session(client)

    response = client.get(
        '/api/search/unified',
        query_string={'q': '서버', 'limit': 10, 'include_briefing': '0'},
    )
    assert response.status_code == 200

    payload = response.get_json()
    assert payload['success'] is True
    assert 'briefing' not in payload


def test_unified_search_briefing_fallback_on_exception(client, monkeypatch):
    _auth_session(client)

    import app.routes.api as api_module

    def _raise_error(*args, **kwargs):
        raise RuntimeError('forced briefing error')

    monkeypatch.setattr(api_module, '_build_unified_search_briefing', _raise_error)

    response = client.get('/api/search/unified', query_string={'q': '서버', 'limit': 10})
    assert response.status_code == 200

    payload = response.get_json()
    assert payload['success'] is True
    assert payload['briefing']['fallback_used'] is True
    assert payload['briefing']['confidence']['grade'] == 'low'
