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
        )
        db.session.add(alice)
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
            "post_id": post.id,
        }


def test_blog_list_includes_like_fields(app, seeded_blog):
    client = app.test_client()
    _login(client, user_id=seeded_blog["alice_id"], emp_no=seeded_blog["alice_emp_no"])

    resp = client.get("/api/insight/blog/posts?limit=5&offset=0")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    items = body.get("items") or []
    assert any(int(it.get("id")) == int(seeded_blog["post_id"]) for it in items)

    # Ensure fields exist on the returned items
    it = next(it for it in items if int(it.get("id")) == int(seeded_blog["post_id"]))
    assert "likeTotal" in it
    assert "likedByMe" in it
