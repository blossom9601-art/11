import pytest


@pytest.fixture()
def sample_ad_payload():
    return {
        "domain_name": "corp.example.local",
        "fqdn": "dc01.corp.example.local",
        "role": "DC",
        "is_standby": 0,
        "status": "ACTIVE",
        "main_group": "Core IT",
        "note": "seed",
    }


def test_network_ad_accounts_and_logs_flow(client, sample_ad_payload):
    # Create AD
    resp = client.post("/api/network/ad", json=sample_ad_payload)
    assert resp.status_code in (200, 201)
    created = resp.get_json()
    ad_id = created["ad_id"]

    # Accounts empty
    resp = client.get(f"/api/network/ad/{ad_id}/accounts")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert data["total"] == 0

    # Create account
    payload = {
        "username": "svc_ldap_bind",
        "display_name": "LDAP Bind",
        "account_type": "BIND",
        "status": "ACTIVE",
        "owner": "Infra Team",
        "password_expires_at": "2026-01-01",
        "purpose": "AD read-only bind for sync",
        "note": "rotate quarterly",
    }
    resp = client.post(f"/api/network/ad/{ad_id}/accounts", json=payload)
    assert resp.status_code in (200, 201)
    created_acc = resp.get_json()["item"]
    assert created_acc["ad_id"] == ad_id
    assert created_acc["username"] == payload["username"]
    assert created_acc["account_type"] == payload["account_type"]

    account_id = created_acc["account_id"]

    # Update account
    resp = client.put(
        f"/api/network/ad/accounts/{account_id}",
        json={"status": "INACTIVE", "note": "disabled"},
    )
    assert resp.status_code == 200
    updated_acc = resp.get_json()["item"]
    assert updated_acc["status"] == "INACTIVE"
    assert updated_acc["note"] == "disabled"

    # List accounts
    resp = client.get(f"/api/network/ad/{ad_id}/accounts")
    assert resp.status_code == 200
    listed = resp.get_json()
    assert listed["total"] == 1
    assert listed["items"][0]["account_id"] == account_id

    # Logs should include AD create + account create + account update (at least)
    resp = client.get(f"/api/network/ad/{ad_id}/logs?page=1&page_size=200")
    assert resp.status_code == 200
    logs = resp.get_json()
    assert logs["success"] is True
    assert logs["total"] >= 2
    messages = [row.get("message", "") for row in logs.get("items", [])]
    assert any(f"계정 {payload['username']} 추가" in m for m in messages)

    # Delete account
    resp = client.delete(f"/api/network/ad/accounts/{account_id}")
    assert resp.status_code == 200
    deleted = resp.get_json()
    assert deleted.get("deleted") in (True, 1)

    # Accounts empty again
    resp = client.get(f"/api/network/ad/{ad_id}/accounts")
    assert resp.status_code == 200
    assert resp.get_json()["total"] == 0
