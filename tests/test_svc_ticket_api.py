import io

from app.models import db, OrgDepartment, UserProfile


def _login_as_profile(client, profile_id: int, emp_no: str = "TEST"):
    with client.session_transaction() as session_tx:
        session_tx["user_id"] = profile_id
        session_tx["emp_no"] = emp_no


def _create_dept_and_user():
    dept = OrgDepartment(dept_code="D001", dept_name="테스트부서")
    db.session.add(dept)
    db.session.flush()

    user = UserProfile(emp_no="TEST001", name="테스터", department_id=dept.id)
    db.session.add(user)
    db.session.commit()
    # Return primitives only (ORM instances may be detached outside app_context)
    return {
        "dept_id": dept.id,
        "user_id": user.id,
        "emp_no": user.emp_no,
    }


def test_ticket_crud_json(client, app):
    with app.app_context():
        ctx = _create_dept_and_user()

    _login_as_profile(client, ctx["user_id"], emp_no=ctx["emp_no"])

    create_payload = {
        "title": "테스트 티켓",
        "ticket_type": "하드웨어",
        "category": "분류A",
        "priority": "높음",
        "due_at": "2025-12-31 12:00",
        "detail": "상세 내용",
    }
    resp = client.post("/api/tickets", json=create_payload)
    assert resp.status_code == 201
    body = resp.get_json()
    assert body and body.get("success") is True
    ticket_id = body["item"]["id"]

    resp = client.get("/api/tickets")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    assert any(item["id"] == ticket_id for item in body.get("items", []))

    resp = client.get(f"/api/tickets/{ticket_id}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    assert body["item"]["title"] == "테스트 티켓"

    update_payload = {
        "status": "진행중",
        "resolution_summary": "처리중",
    }
    resp = client.put(f"/api/tickets/{ticket_id}", json=update_payload)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    assert body["item"]["status"] == "진행중"

    resp = client.delete(f"/api/tickets/{ticket_id}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True

    resp = client.get(f"/api/tickets/{ticket_id}")
    assert resp.status_code == 404


def test_ticket_files_flow(client, app):
    with app.app_context():
        ctx = _create_dept_and_user()

    _login_as_profile(client, ctx["user_id"], emp_no=ctx["emp_no"])

    resp = client.post(
        "/api/tickets",
        json={
            "title": "첨부 테스트",
            "ticket_type": "기타",
            "priority": "보통",
            "due_at": "2025-12-31 12:00",
        },
    )
    assert resp.status_code == 201
    ticket_id = resp.get_json()["item"]["id"]

    data = {
        "attachments": (io.BytesIO(b"hello"), "hello.txt"),
    }
    resp = client.post(
        f"/api/tickets/{ticket_id}/files",
        data=data,
        content_type="multipart/form-data",
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body and body.get("success") is True
    file_id = body["items"][0]["id"]

    resp = client.get(f"/api/tickets/{ticket_id}/files")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    assert body.get("total") == 1

    resp = client.get(f"/api/tickets/{ticket_id}/files/{file_id}/download")
    assert resp.status_code == 200

    resp = client.delete(f"/api/tickets/{ticket_id}/files/{file_id}")
    assert resp.status_code == 200

    resp = client.get(f"/api/tickets/{ticket_id}/files")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body and body.get("success") is True
    assert body.get("total") == 0
