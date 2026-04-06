import pytest

from app.models import Blog, OrgDepartment, UserProfile, db


def _login(client, *, user_id: int, emp_no: str) -> None:
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()
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
            "dept_id": dept.id,
            "alice_id": alice.id,
            "alice_emp_no": alice.emp_no,
            "bob_id": bob.id,
            "bob_emp_no": bob.emp_no,
            "post_id": post.id,
        }


def test_blog_comments_visible_across_users_and_author_fields(app, client, seeded_blog):
    post_id = seeded_blog["post_id"]

    alice_client = app.test_client()
    bob_client = app.test_client()

    _login(alice_client, user_id=seeded_blog["alice_id"], emp_no=seeded_blog["alice_emp_no"])
    _login(bob_client, user_id=seeded_blog["bob_id"], emp_no=seeded_blog["bob_emp_no"])

    # Alice creates a root comment
    resp = alice_client.post(
        f"/api/insight/blog/posts/{post_id}/comments",
        json={"content": "First!"},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body and body.get("success") is True
    item = body["item"]
    assert item["content"] == "First!"
    assert item["parentId"] is None
    assert item["authorName"] == "Alice"
    assert item["authorAvatarUrl"] == "/static/test/alice.png"
    assert item["likeTotal"] == 0
    assert item["likedByMe"] is False
    assert item["replyTotal"] == 0
    root_id = item["id"]

    # Bob can see Alice's comment
    resp = bob_client.get(f"/api/insight/blog/posts/{post_id}/comments")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    items = body.get("items") or []
    assert len(items) == 1
    assert items[0]["id"] == root_id
    assert items[0]["authorName"] == "Alice"
    assert items[0]["likeTotal"] == 0
    assert items[0]["likedByMe"] is False
    assert items[0]["replyTotal"] == 0

    # Bob replies (대댓글)
    resp = bob_client.post(
        f"/api/insight/blog/posts/{post_id}/comments",
        json={"content": "Reply from Bob", "parentId": root_id},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body and body.get("success") is True
    reply = body["item"]
    assert reply["parentId"] == root_id
    assert reply["authorName"] == "Bob"
    assert reply["authorAvatarUrl"] == "/static/test/bob.png"
    assert reply["likeTotal"] == 0
    assert reply["likedByMe"] is False
    assert reply["replyTotal"] == 0

    # Alice sees both comments, ordered oldest->newest
    resp = alice_client.get(f"/api/insight/blog/posts/{post_id}/comments")
    assert resp.status_code == 200
    body = resp.get_json()
    items = body.get("items") or []
    assert [i["id"] for i in items] == [root_id, reply["id"]]
    assert items[0]["replyTotal"] == 1
    assert items[1]["replyTotal"] == 0
