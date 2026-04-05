"""Smoke-check: Dedicated line tab APIs (managers/diagram/tasks/logs).

Covers:
- create leased line
- managers CRUD + email validation
- diagram upload/get/raw/delete
- tasks CRUD
- logs list after update + reason update

Run:
  .venv/Scripts/python.exe scripts/_smoke_check_dedicatedline_tabs_api.py
"""

from __future__ import annotations

import os
import sys
from io import BytesIO

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


def main() -> int:
    from app import create_app
    from app.models import UserProfile, db
    from app.services.network_leased_line_log_service import init_network_leased_line_log_table

    app = create_app("testing")

    with app.app_context():
        db.create_all()
        init_network_leased_line_log_table(app)

        actor = UserProfile.query.filter_by(emp_no="ACTOR001").first()
        if not actor:
            actor = UserProfile(
                emp_no="ACTOR001",
                name="Actor Tester",
                department="IT",
                email="actor001@example.com",
            )
            db.session.add(actor)
            db.session.commit()
        actor_user_id = int(actor.id)

    client = app.test_client()
    with client.session_transaction() as sess:
        sess["emp_no"] = "ACTOR001"
        sess["user_profile_id"] = actor_user_id

    # Create a leased line
    r = client.post(
        "/api/network/leased-lines",
        json={
            "line_group": "G_SMK",
            "org_name": "ORG-SMK",
            "status_code": "ACTIVE",
            "line_no": "LL-SMK-001",
            "line_name": "Smoke Line",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 201, r.get_json()
    leased_id = r.get_json()["item"]["id"]

    # ----- Managers -----
    r = client.post(
        f"/api/network/leased-lines/{leased_id}/managers",
        json={"name": "Alice", "email": "not-an-email", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 400, r.get_json()

    r = client.post(
        f"/api/network/leased-lines/{leased_id}/managers",
        json={"name": "Alice", "email": "alice@example.com", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 201, r.get_json()
    mgr_id = r.get_json()["item"]["id"]

    r = client.put(
        f"/api/network/leased-lines/{leased_id}/managers/{mgr_id}",
        json={"email": "bad@@example", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 400, r.get_json()

    r = client.put(
        f"/api/network/leased-lines/{leased_id}/managers/{mgr_id}",
        json={"email": "alice+ok@example.co.kr", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 200, r.get_json()

    # ----- Diagram -----
    r = client.get(f"/api/network/leased-lines/{leased_id}/diagram")
    assert r.status_code == 200, r.get_json()
    assert r.get_json().get("item") is None

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"0" * 128
    data = {
        "file": (BytesIO(png_bytes), "diagram.png"),
        "actor_user_id": str(actor_user_id),
    }
    r = client.post(
        f"/api/network/leased-lines/{leased_id}/diagram",
        data=data,
        content_type="multipart/form-data",
    )
    assert r.status_code == 201, r.get_json()
    raw_url = r.get_json()["item"]["raw_url"]

    r = client.get(f"/api/network/leased-lines/{leased_id}/diagram")
    assert r.status_code == 200
    assert r.get_json()["item"]["raw_url"] == raw_url

    r = client.get(raw_url)
    assert r.status_code == 200
    assert r.data.startswith(b"\x89PNG\r\n\x1a\n")

    r = client.delete(
        f"/api/network/leased-lines/{leased_id}/diagram",
        json={"actor_user_id": actor_user_id},
    )
    assert r.status_code == 200, r.get_json()

    r = client.get(raw_url)
    assert r.status_code == 404

    # ----- Attachments -----
    r = client.get(f"/api/network/leased-lines/{leased_id}/attachments")
    assert r.status_code == 200
    assert r.get_json().get("items") == []

    txt_bytes = b"hello attachment"
    r = client.post(
        "/api/uploads",
        data={"file": (BytesIO(txt_bytes), "hello.txt")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 201, r.get_json()
    token = r.get_json()["id"]
    name = r.get_json()["name"]
    size = int(r.get_json()["size"])

    r = client.post(
        f"/api/network/leased-lines/{leased_id}/attachments",
        json={
            "upload_token": token,
            "file_name": name,
            "file_size": size,
            "mime_type": "text/plain",
            "file_path": f"/api/uploads/{token}/download",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 201, r.get_json()
    att_id = int(r.get_json()["item"]["id"])

    r = client.get(f"/api/network/leased-lines/{leased_id}/attachments")
    assert r.status_code == 200
    items = r.get_json().get("items") or []
    assert any(x.get("id") == att_id for x in items)

    r = client.get(f"/api/uploads/{token}/download")
    assert r.status_code == 200
    assert r.data == txt_bytes

    r = client.delete(
        f"/api/network/leased-lines/{leased_id}/attachments/{att_id}",
        json={"actor_user_id": actor_user_id},
    )
    assert r.status_code == 200, r.get_json()

    # token delete is best-effort (mirrors UI behavior)
    client.delete(f"/api/uploads/{token}")

    # ----- Tasks -----
    r = client.get(f"/api/network/leased-lines/{leased_id}/tasks")
    assert r.status_code == 200
    assert r.get_json()["items"] == []

    r = client.post(
        f"/api/network/leased-lines/{leased_id}/tasks",
        json={"name": "작업1", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 400

    r = client.post(
        f"/api/network/leased-lines/{leased_id}/tasks",
        json={
            "status": "진행",
            "task_no": "TK-001",
            "name": "작업1",
            "type": "정기",
            "category": "점검",
            "start": "2025-01-10 10:00",
            "end": "2025-01-10 11:00",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 201, r.get_json()
    task_id = r.get_json()["item"]["id"]

    r = client.put(
        f"/api/network/leased-lines/{leased_id}/tasks/{task_id}",
        json={"status": "완료", "end": "2025-01-10 12:00", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 200

    r = client.delete(
        f"/api/network/leased-lines/{leased_id}/tasks/{task_id}",
        json={"actor_user_id": actor_user_id},
    )
    assert r.status_code == 200

    r = client.get(f"/api/network/leased-lines/{leased_id}/tasks")
    assert r.status_code == 200
    assert all(x["id"] != task_id for x in r.get_json()["items"])

    r = client.get(f"/api/network/leased-lines/{leased_id}/tasks?include_deleted=1")
    assert r.status_code == 200
    assert any(x["id"] == task_id for x in r.get_json()["items"])

    # ----- Logs -----
    r0 = client.get(f"/api/network/leased-lines/{leased_id}/logs?page=1&page_size=10")
    assert r0.status_code == 200
    before_total = int(r0.get_json().get("total") or 0)

    r = client.put(
        f"/api/network/leased-lines/{leased_id}",
        json={"line_name": "Smoke Line Updated", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 200

    r1 = client.get(f"/api/network/leased-lines/{leased_id}/logs?page=1&page_size=10")
    assert r1.status_code == 200
    after = r1.get_json()
    after_total = int(after.get("total") or 0)
    assert after_total >= before_total + 1

    latest = (after.get("items") or [None])[0] or {}
    log_id = int(latest.get("log_id") or 0)
    assert log_id > 0

    r = client.put(
        f"/api/network/leased-lines/{leased_id}/logs/{log_id}/reason",
        json={"reason": "smoke reason"},
    )
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["item"]["reason"] == "smoke reason"

    print("OK  leased_id:", leased_id)
    print("OK  managers CRUD")
    print("OK  diagram upload/get/raw/delete")
    print("OK  tasks CRUD")
    print("OK  attachments upload/list/download/delete")
    print("OK  logs append + reason update")
    print("PASSED: dedicatedline tab APIs")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
