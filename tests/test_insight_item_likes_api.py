import pytest


@pytest.mark.usefixtures("client")
def test_insight_likes_one_per_user(client, authed_client, authed_client2):
    # Create an insight item (use authed client for write endpoints if any auth is required elsewhere)
    r = authed_client.post(
        "/api/insight/items",
        json={
            "category": "trend",
            "title": "Like test",
            "author": "tester",
            "content_html": "<p>hello</p>",
            "tags": "",
        },
    )
    assert r.status_code == 201, r.get_data(as_text=True)
    body = r.get_json()
    assert body["success"] is True
    item_id = body["item"]["id"]

    # Like as user A
    r1 = authed_client.post(f"/api/insight/items/{item_id}/likes")
    assert r1.status_code == 200
    b1 = r1.get_json()
    assert b1["success"] is True
    assert b1.get("likedByMe") is True
    likes_after_first = b1["item"]["likes"]

    # Like again as user A: should NOT increment
    r2 = authed_client.post(f"/api/insight/items/{item_id}/likes")
    assert r2.status_code == 200
    b2 = r2.get_json()
    assert b2["success"] is True
    assert b2.get("likedByMe") is True
    assert b2["item"]["likes"] == likes_after_first

    # Like as user B: should increment once
    r3 = authed_client2.post(f"/api/insight/items/{item_id}/likes")
    assert r3.status_code == 200
    b3 = r3.get_json()
    assert b3["success"] is True
    assert b3.get("likedByMe") is True
    assert b3["item"]["likes"] == likes_after_first + 1

    # Unlike as user A: should decrement by 1 and likedByMe false
    r4 = authed_client.delete(f"/api/insight/items/{item_id}/likes")
    assert r4.status_code == 200
    b4 = r4.get_json()
    assert b4["success"] is True
    assert b4.get("likedByMe") is False
    assert b4["item"]["likes"] == likes_after_first

    # After unlike, A can like again (should increment back)
    r5 = authed_client.post(f"/api/insight/items/{item_id}/likes")
    assert r5.status_code == 200
    b5 = r5.get_json()
    assert b5["success"] is True
    assert b5.get("likedByMe") is True
    assert b5["item"]["likes"] == likes_after_first + 1


@pytest.mark.usefixtures("client")
def test_insight_like_requires_login(client, authed_client):
    # Create an insight item
    r = authed_client.post(
        "/api/insight/items",
        json={
            "category": "trend",
            "title": "Like auth test",
            "author": "tester",
            "content_html": "<p>hello</p>",
            "tags": "",
        },
    )
    assert r.status_code == 201, r.get_data(as_text=True)
    item_id = r.get_json()["item"]["id"]

    # Like with unauthenticated client should 401
    r2 = client.post(f"/api/insight/items/{item_id}/likes")
    assert r2.status_code == 401

    # Unlike with unauthenticated client should 401
    r3 = client.delete(f"/api/insight/items/{item_id}/likes")
    assert r3.status_code == 401


@pytest.mark.usefixtures("client")
def test_insight_likes_me_endpoint(client, authed_client, authed_client2):
    r = authed_client.post(
        "/api/insight/items",
        json={
            "category": "trend",
            "title": "Like state test",
            "author": "tester",
            "content_html": "<p>hello</p>",
            "tags": "",
        },
    )
    assert r.status_code == 201, r.get_data(as_text=True)
    item_id = r.get_json()["item"]["id"]

    # Not logged in => likedByMe false
    r0 = client.get(f"/api/insight/items/{item_id}/likes/me")
    assert r0.status_code == 200
    assert r0.get_json()["likedByMe"] is False

    # Before like => false
    r1 = authed_client.get(f"/api/insight/items/{item_id}/likes/me")
    assert r1.status_code == 200
    assert r1.get_json()["likedByMe"] is False

    # After like by A => A true, B false
    authed_client.post(f"/api/insight/items/{item_id}/likes")

    r2 = authed_client.get(f"/api/insight/items/{item_id}/likes/me")
    assert r2.status_code == 200
    assert r2.get_json()["likedByMe"] is True

    r3 = authed_client2.get(f"/api/insight/items/{item_id}/likes/me")
    assert r3.status_code == 200
    assert r3.get_json()["likedByMe"] is False
