import pytest


def test_leased_line_managers_email_validation(authed_client, actor_user_id):
    # Create a leased line first
    r = authed_client.post(
        "/api/network/leased-lines",
        json={
            "line_group": "G_MG",
            "org_name": "ORG-MG",
            "status_code": "ACTIVE",
            "line_no": "LL-MG-001",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 201, r.get_json()
    leased_id = r.get_json()["item"]["id"]

    # Invalid email should be rejected
    r = authed_client.post(
        f"/api/network/leased-lines/{leased_id}/managers",
        json={
            "name": "Alice",
            "email": "not-an-email",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 400
    assert r.get_json()["success"] is False

    # Valid email should be accepted
    r = authed_client.post(
        f"/api/network/leased-lines/{leased_id}/managers",
        json={
            "name": "Alice",
            "email": "alice@example.com",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 201, r.get_json()
    mgr = r.get_json()["item"]
    assert mgr["email"] == "alice@example.com"

    # Update: invalid email should be rejected
    r = authed_client.put(
        f"/api/network/leased-lines/{leased_id}/managers/{mgr['id']}",
        json={
            "email": "bad@@example",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 400

    # Update: valid email should be accepted
    r = authed_client.put(
        f"/api/network/leased-lines/{leased_id}/managers/{mgr['id']}",
        json={
            "email": "alice+ok@example.co.kr",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 200
    assert r.get_json()["item"]["email"] == "alice+ok@example.co.kr"
