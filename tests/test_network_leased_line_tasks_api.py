def test_leased_line_tasks_crud(authed_client, actor_user_id):
    # Create a leased line first
    r = authed_client.post(
        "/api/network/leased-lines",
        json={
            "line_group": "G_TK",
            "org_name": "ORG-TK",
            "status_code": "ACTIVE",
            "line_no": "LL-TK-001",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 201, r.get_json()
    leased_id = r.get_json()["item"]["id"]

    # Initially empty
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/tasks")
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["success"] is True
    assert payload["items"] == []

    # Missing required fields should be rejected
    r = authed_client.post(
        f"/api/network/leased-lines/{leased_id}/tasks",
        json={"name": "작업1", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 400
    assert r.get_json()["success"] is False

    # Create
    r = authed_client.post(
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
    created = r.get_json()["item"]
    assert created["line_id"] == leased_id
    assert created["name"] == "작업1"
    task_id = created["id"]

    # List includes it
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/tasks")
    assert r.status_code == 200
    items = r.get_json()["items"]
    assert any(x["id"] == task_id for x in items)

    # Update
    r = authed_client.put(
        f"/api/network/leased-lines/{leased_id}/tasks/{task_id}",
        json={"status": "완료", "end": "2025-01-10 12:00", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 200, r.get_json()
    updated = r.get_json()["item"]
    assert updated["status"] == "완료"
    assert updated["end"] == "2025-01-10 12:00"

    # Soft delete
    r = authed_client.delete(
        f"/api/network/leased-lines/{leased_id}/tasks/{task_id}",
        json={"actor_user_id": actor_user_id},
    )
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["success"] is True

    # Not visible by default
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/tasks")
    assert r.status_code == 200
    assert all(x["id"] != task_id for x in r.get_json()["items"])

    # Visible with include_deleted=1
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/tasks?include_deleted=1")
    assert r.status_code == 200
    assert any(x["id"] == task_id for x in r.get_json()["items"])
