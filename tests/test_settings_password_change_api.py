import pytest

from app.models import db, AuthUser


def _seed_auth_user(app, *, emp_no: str, password: str) -> int:
    with app.app_context():
        user = AuthUser(emp_no=emp_no, email=f"{emp_no}@example.com", role="user", status="active")
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        return int(user.id)


def _login_session(client, *, user_id: int, emp_no: str) -> None:
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["emp_no"] = emp_no


def test_settings_password_change_success(app, client):
    emp_no = "PWTEST001"
    user_id = _seed_auth_user(app, emp_no=emp_no, password="OldPass123!")
    _login_session(client, user_id=user_id, emp_no=emp_no)

    resp = client.post(
        "/settings/password",
        json={
            "current_password": "OldPass123!",
            "new_password": "NewPass123!",
            "confirm_password": "NewPass123!",
        },
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "ok"

    with app.app_context():
        user = AuthUser.query.get(user_id)
        assert user is not None
        assert user.check_password("NewPass123!")


def test_settings_password_change_rejects_wrong_current(app, client):
    emp_no = "PWTEST002"
    user_id = _seed_auth_user(app, emp_no=emp_no, password="OldPass123!")
    _login_session(client, user_id=user_id, emp_no=emp_no)

    resp = client.post(
        "/settings/password",
        json={
            "current_password": "WRONGPASS!",
            "new_password": "NewPass123!",
            "confirm_password": "NewPass123!",
        },
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "invalid_current_password"


def test_settings_password_change_rejects_weak_password(app, client):
    emp_no = "PWTEST003"
    user_id = _seed_auth_user(app, emp_no=emp_no, password="OldPass123!")
    _login_session(client, user_id=user_id, emp_no=emp_no)

    resp = client.post(
        "/settings/password",
        json={
            "current_password": "OldPass123!",
            "new_password": "short1!",
            "confirm_password": "short1!",
        },
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation"


def test_settings_password_change_rejects_same_password(app, client):
    emp_no = "PWTEST004"
    user_id = _seed_auth_user(app, emp_no=emp_no, password="OldPass123!")
    _login_session(client, user_id=user_id, emp_no=emp_no)

    resp = client.post(
        "/settings/password",
        json={
            "current_password": "OldPass123!",
            "new_password": "OldPass123!",
            "confirm_password": "OldPass123!",
        },
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation"
