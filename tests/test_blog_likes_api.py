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
        )
        bob = UserProfile(
            emp_no="E002",
            name="Bob",
            department_id=dept.id,
            department=dept.dept_name,
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


def test_blog_likes_are_per_user_and_aggregate(app, seeded_blog):
    post_id = seeded_blog["post_id"]

    alice_client = app.test_client()
    bob_client = app.test_client()

    _login(alice_client, user_id=seeded_blog["alice_id"], emp_no=seeded_blog["alice_emp_no"])
    _login(bob_client, user_id=seeded_blog["bob_id"], emp_no=seeded_blog["bob_emp_no"])

    # Initial: 0 likes
    resp = alice_client.get(f"/api/insight/blog/posts/{post_id}/likes")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    assert body["total"] == 0

    # Alice likes -> 1
    resp = alice_client.post(f"/api/insight/blog/posts/{post_id}/likes")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    assert body["total"] == 1
    assert body["likedByMe"] is True

    # Bob likes -> 2 (does not reset)
    resp = bob_client.post(f"/api/insight/blog/posts/{post_id}/likes")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    assert body["total"] == 2
    assert body["likedByMe"] is True

    # Alice sees total 2 and likedByMe True
    resp = alice_client.get(f"/api/insight/blog/posts/{post_id}/likes")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"] == 2
    assert body["likedByMe"] is True

    # Alice unlikes -> total 1
    resp = alice_client.delete(f"/api/insight/blog/posts/{post_id}/likes")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"] == 1
    assert body["likedByMe"] is False
