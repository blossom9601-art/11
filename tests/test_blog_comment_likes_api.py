import pytest

from app.models import Blog, OrgDepartment, UserProfile, db


def _login(client, *, user_id: int, emp_no: str) -> None:
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["emp_no"] = emp_no


@pytest.fixture
def seeded_blog(app):
    with app.app_context():
        dept = OrgDepartment(dept_code="D001", dept_name="Engineering", created_by="test")
        db.session.add(dept)
        db.session.flush()

        alice = UserProfile(
            emp_no="E001",
            name="Alice",
            department_id=dept.id,
            department=dept.dept_name,
            profile_image="/static/test/alice.png",
        )
        bob = UserProfile(
            emp_no="E002",
            name="Bob",
            department_id=dept.id,
            department=dept.dept_name,
            profile_image="/static/test/bob.png",
        )
        db.session.add_all([alice, bob])
        db.session.flush()

        post = Blog(
            title="Test Post",
            content_html="<p>Hello</p>",
            tags="test",
            author="Seeder",
        )
        db.session.add(post)
        db.session.commit()

        return {
            "alice_id": alice.id,
            "alice_emp_no": alice.emp_no,
            "bob_id": bob.id,
            "bob_emp_no": bob.emp_no,
            "post_id": post.id,
        }


def test_blog_comment_likes_are_db_backed_and_per_user(app, seeded_blog):
    post_id = seeded_blog["post_id"]

    alice_client = app.test_client()
    bob_client = app.test_client()

    _login(alice_client, user_id=seeded_blog["alice_id"], emp_no=seeded_blog["alice_emp_no"])
    _login(bob_client, user_id=seeded_blog["bob_id"], emp_no=seeded_blog["bob_emp_no"])

    # Alice creates a root comment
    resp = alice_client.post(f"/api/insight/blog/posts/{post_id}/comments", json={"content": "First!"})
    assert resp.status_code == 201
    root = resp.get_json()["item"]
    root_id = root["id"]

    # Like totals start at 0
    resp = alice_client.get(f"/api/insight/blog/posts/{post_id}/comments")
    assert resp.status_code == 200
    items = resp.get_json()["items"]
    assert items[0]["likeTotal"] == 0
    assert items[0]["likedByMe"] is False

    # Alice likes the comment
    resp = alice_client.post(f"/api/insight/blog/posts/{post_id}/comments/{root_id}/likes")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["total"] == 1
    assert body["likedByMe"] is True

    # Bob likes the same comment -> total becomes 2
    resp = bob_client.post(f"/api/insight/blog/posts/{post_id}/comments/{root_id}/likes")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"] == 2
    assert body["likedByMe"] is True

    # List endpoint reflects totals and per-user likedByMe
    resp = alice_client.get(f"/api/insight/blog/posts/{post_id}/comments")
    assert resp.status_code == 200
    items = resp.get_json()["items"]
    assert items[0]["likeTotal"] == 2
    assert items[0]["likedByMe"] is True

    resp = bob_client.get(f"/api/insight/blog/posts/{post_id}/comments")
    assert resp.status_code == 200
    items = resp.get_json()["items"]
    assert items[0]["likeTotal"] == 2
    assert items[0]["likedByMe"] is True

    # Bob unlikes -> total becomes 1
    resp = bob_client.delete(f"/api/insight/blog/posts/{post_id}/comments/{root_id}/likes")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"] == 1
    assert body["likedByMe"] is False

    resp = alice_client.get(f"/api/insight/blog/posts/{post_id}/comments")
    assert resp.status_code == 200
    items = resp.get_json()["items"]
    assert items[0]["likeTotal"] == 1
    assert items[0]["likedByMe"] is True


def test_blog_comment_reply_total_is_returned(app, seeded_blog):
    post_id = seeded_blog["post_id"]
    alice_client = app.test_client()
    bob_client = app.test_client()

    _login(alice_client, user_id=seeded_blog["alice_id"], emp_no=seeded_blog["alice_emp_no"])
    _login(bob_client, user_id=seeded_blog["bob_id"], emp_no=seeded_blog["bob_emp_no"])

    resp = alice_client.post(f"/api/insight/blog/posts/{post_id}/comments", json={"content": "Root"})
    assert resp.status_code == 201
    root_id = resp.get_json()["item"]["id"]

    # Create 6 replies
    for i in range(6):
        resp = bob_client.post(
            f"/api/insight/blog/posts/{post_id}/comments",
            json={"content": f"Reply {i}", "parentId": root_id},
        )
        assert resp.status_code == 201

    resp = alice_client.get(f"/api/insight/blog/posts/{post_id}/comments")
    assert resp.status_code == 200
    items = resp.get_json()["items"]
    # Root has 6 replies; replies have 0
    assert items[0]["id"] == root_id
    assert items[0]["replyTotal"] == 6
    for it in items[1:]:
        assert it["replyTotal"] == 0
