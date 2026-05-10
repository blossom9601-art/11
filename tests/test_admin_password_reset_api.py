from datetime import datetime, timedelta

from app.models import AuthUser, db


def _create_auth_user(emp_no, password='OldPass123!'):
    user = AuthUser(emp_no=emp_no, email=f'{emp_no}@example.com', role='user', status='active')
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return user


def _admin_client(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['emp_no'] = 'ADMIN001'
        sess['role'] = 'admin'
    return client


def test_admin_password_reset_accepts_ajax_trailing_slash(app):
    with app.app_context():
        _create_auth_user('20184037')

    client = _admin_client(app)
    resp = client.post(
        '/admin/auth/password_reset/',
        data={'emp_no': '20184037'},
        headers={'X-Requested-With': 'XMLHttpRequest'},
    )

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload['status'] == 'ok'
    assert payload['temporary_password'] == 'Reset4037!'

    with app.app_context():
        user = AuthUser.query.filter_by(emp_no='20184037').first()
        assert user.check_password('Reset4037!')


def test_admin_password_reset_ajax_requires_admin(app):
    with app.app_context():
        _create_auth_user('20184037')

    client = app.test_client()
    resp = client.post(
        '/admin/auth/password_reset',
        data={'emp_no': '20184037'},
        headers={'X-Requested-With': 'XMLHttpRequest'},
    )

    assert resp.status_code == 403
    assert resp.get_json()['error'] == 'unauthorized'


def test_admin_lock_reset_accepts_ajax_trailing_slash(app):
    with app.app_context():
        user = _create_auth_user('20184037')
        user.login_fail_cnt = 5
        user.locked_until = datetime.utcnow() + timedelta(minutes=30)
        db.session.commit()

    client = _admin_client(app)
    resp = client.post(
        '/admin/auth/locked/',
        data={'emp_no': '20184037'},
        headers={'X-Requested-With': 'XMLHttpRequest'},
    )

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload['status'] == 'ok'

    with app.app_context():
        user = AuthUser.query.filter_by(emp_no='20184037').first()
        assert user.login_fail_cnt == 0
        assert user.locked_until is None


def test_admin_lock_reset_ajax_requires_admin(app):
    with app.app_context():
        _create_auth_user('20184037')

    client = app.test_client()
    resp = client.post(
        '/admin/auth/locked',
        data={'emp_no': '20184037'},
        headers={'X-Requested-With': 'XMLHttpRequest'},
    )

    assert resp.status_code == 403
    assert resp.get_json()['error'] == 'unauthorized'
