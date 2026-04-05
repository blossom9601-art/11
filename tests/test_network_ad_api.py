import pytest


@pytest.fixture()
def sample_ad_payload():
    return {
        "domain_name": "corp.example.local",
        "fqdn": "dc01.corp.example.local",
        "role": "DC",
        "is_standby": 0,
        "status": "ACTIVE",
        "total_accounts": 1200,
        "active_accounts": 1188,
        "main_group": "Core IT",
        "note": "seed",
        "created_by": "pytest",
        "updated_by": "pytest",
    }


def test_network_ad_crud_flow(client, sample_ad_payload):
    # Empty list
    resp = client.get("/api/network/ad")
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, dict)
    assert "items" in data
    assert "total" in data

    # Create
    resp = client.post("/api/network/ad", json=sample_ad_payload)
    assert resp.status_code in (200, 201)
    created = resp.get_json()
    assert created["domain_name"] == sample_ad_payload["domain_name"]
    assert created["fqdn"] == sample_ad_payload["fqdn"]
    assert "ad_id" in created
    ad_id = created["ad_id"]

    # Get
    resp = client.get(f"/api/network/ad/{ad_id}")
    assert resp.status_code == 200
    got = resp.get_json()
    assert got["ad_id"] == ad_id

    # Update
    resp = client.put(
        f"/api/network/ad/{ad_id}",
        json={"status": "INACTIVE", "note": "updated"},
    )
    assert resp.status_code == 200
    updated = resp.get_json()
    assert updated["status"] == "INACTIVE"
    assert updated["note"] == "updated"

    # List with search
    resp = client.get("/api/network/ad?q=corp.example")
    assert resp.status_code == 200
    listed = resp.get_json()
    assert listed["total"] >= 1
    assert any(item.get("ad_id") == ad_id for item in listed["items"])

    # Delete
    resp = client.delete(f"/api/network/ad/{ad_id}")
    assert resp.status_code == 200
    deleted = resp.get_json()
    assert deleted.get("deleted") in (True, 1)

    # Get missing -> 404
    resp = client.get(f"/api/network/ad/{ad_id}")
    assert resp.status_code == 404


def test_network_ad_missing_returns_404(client):
    resp = client.get("/api/network/ad/999999")
    assert resp.status_code == 404
