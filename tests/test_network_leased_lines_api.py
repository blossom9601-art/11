import pytest


@pytest.mark.usefixtures("client")
def test_leased_lines_routes_exist(client):
    # If tables aren't migrated, API should return 503 (not 404)
    r = client.get("/api/network/leased-lines")
    assert r.status_code != 404


@pytest.mark.usefixtures("client")
def test_leased_lines_crud_smoke(client, actor_user_id):
    # create
    payload = {
        "line_group": "G1",
        "org_name": "ORG-A",
        "status_code": "ACTIVE",
        "carrier_code": "KT",
        "protocol_code": "MPLS",
        "management_owner": "NOC",
        "line_no": "LL-001",
        "line_name": "LeasedLine 1",
        "business_purpose": "VPN Backbone",
        "speed_label": "1G",
        "opened_date": "2025-01-01",
        "closed_date": None,
        "dr_line_no": None,
        "device_name": "R1",
        "comm_device": "SW1",
        "slot_no": 1,
        "port_no": "1/1",
        "child_device_name": None,
        "child_port_no": None,
        "our_jurisdiction": "HQ",
        "org_jurisdiction": "ORG",
        "remark": "test",
        "actor_user_id": actor_user_id,
    }

    r = client.post("/api/network/leased-lines", json=payload)
    assert r.status_code == 201, r.get_json()
    created = r.get_json()["item"]
    assert created["line_group"] == "G1"
    assert created["line_no"] == "LL-001"
    leased_id = created["id"]

    # list (filter)
    r = client.get("/api/network/leased-lines?line_group=G1")
    assert r.status_code == 200
    data = r.get_json()
    assert any(x["id"] == leased_id for x in data["items"])

    # get
    r = client.get(f"/api/network/leased-lines/{leased_id}")
    assert r.status_code == 200
    assert r.get_json()["item"]["id"] == leased_id

    # update
    r = client.put(
        f"/api/network/leased-lines/{leased_id}",
        json={"line_name": "LeasedLine 1b", "actor_user_id": actor_user_id},
    )
    assert r.status_code == 200
    assert r.get_json()["item"]["line_name"] == "LeasedLine 1b"

    # soft delete
    r = client.delete(
        f"/api/network/leased-lines/{leased_id}",
        json={"actor_user_id": actor_user_id},
    )
    assert r.status_code == 200

    # not visible by default
    r = client.get("/api/network/leased-lines?line_group=G1")
    assert r.status_code == 200
    assert all(x["id"] != leased_id for x in r.get_json()["items"])

    # visible with include_deleted=1
    r = client.get("/api/network/leased-lines?line_group=G1&include_deleted=1")
    assert r.status_code == 200
    assert any(x["id"] == leased_id for x in r.get_json()["items"])


@pytest.mark.usefixtures("client")
def test_leased_lines_unique_constraint(client, actor_user_id):
    base = {
        "line_group": "G2",
        "org_name": "ORG-B",
        "status_code": "ACTIVE",
        "line_no": "LL-002",
        "actor_user_id": actor_user_id,
    }

    r = client.post("/api/network/leased-lines", json=base)
    assert r.status_code == 201

    # duplicate within same (line_group, line_no) should be rejected
    r = client.post("/api/network/leased-lines", json=base)
    assert r.status_code == 409


@pytest.mark.usefixtures("client")
def test_leased_lines_bulk_delete(client, actor_user_id):
    ids = []
    for i in range(3):
        r = client.post(
            "/api/network/leased-lines",
            json={
                "line_group": "G3",
                "org_name": "ORG-C",
                "status_code": "ACTIVE",
                "line_no": f"LL-00{10+i}",
                "actor_user_id": actor_user_id,
            },
        )
        assert r.status_code == 201
        ids.append(r.get_json()["item"]["id"])

    r = client.post(
        "/api/network/leased-lines/bulk-delete",
        json={"ids": ids, "actor_user_id": actor_user_id},
    )
    assert r.status_code == 200

    r = client.get("/api/network/leased-lines?line_group=G3")
    assert r.status_code == 200
    assert len(r.get_json()["items"]) == 0
