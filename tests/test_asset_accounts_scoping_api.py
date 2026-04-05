import pytest


def _create_account(authed_client, *, scope: str, asset_id: int, system_key: str, account_name: str):
    payload = {
        "asset_scope": scope,
        "asset_id": asset_id,
        "system_key": system_key,
        "status": "활성",
        "account_type": "관리",
        "account_name": account_name,
        "group_name": "grp1",
        "user_name": "Actor",
        "login_allowed": True,
        "admin_allowed": False,
        "purpose": "seed",
    }
    resp = authed_client.post("/api/asset-accounts", json=payload)
    assert resp.status_code in (200, 201)
    body = resp.get_json()
    assert body["success"] is True
    assert body["item"]["system_key"] == system_key
    return body["item"]


def test_asset_accounts_are_isolated_by_system_key(client, authed_client):
    scope = "onpremise"
    asset_id = 1

    a = _create_account(authed_client, scope=scope, asset_id=asset_id, system_key="HOST-A", account_name="userA")
    b = _create_account(authed_client, scope=scope, asset_id=asset_id, system_key="HOST-B", account_name="userB")

    # Listing requires system_key
    resp = client.get(f"/api/asset-accounts?asset_scope={scope}&asset_id={asset_id}")
    assert resp.status_code == 400

    resp_a = client.get(f"/api/asset-accounts?asset_scope={scope}&asset_id={asset_id}&system_key=HOST-A")
    assert resp_a.status_code == 200
    items_a = resp_a.get_json()["items"]
    assert len(items_a) == 1
    assert items_a[0]["id"] == a["id"]

    resp_b = client.get(f"/api/asset-accounts?asset_scope={scope}&asset_id={asset_id}&system_key=HOST-B")
    assert resp_b.status_code == 200
    items_b = resp_b.get_json()["items"]
    assert len(items_b) == 1
    assert items_b[0]["id"] == b["id"]

    # Update is constrained by system_key
    wrong_update = authed_client.put(
        f"/api/asset-accounts/{a['id']}",
        json={
            "asset_scope": scope,
            "asset_id": asset_id,
            "system_key": "HOST-B",
            "status": "활성",
            "account_type": "관리",
            "account_name": "userA",
            "group_name": "grp1",
            "user_name": "Actor",
            "login_allowed": True,
            "admin_allowed": False,
            "purpose": "seed",
        },
    )
    assert wrong_update.status_code == 404

    # Delete is constrained by system_key
    wrong_delete = authed_client.delete(
        f"/api/asset-accounts/{a['id']}?asset_scope={scope}&asset_id={asset_id}&system_key=HOST-B"
    )
    assert wrong_delete.status_code == 404

    ok_delete = authed_client.delete(
        f"/api/asset-accounts/{a['id']}?asset_scope={scope}&asset_id={asset_id}&system_key=HOST-A"
    )
    assert ok_delete.status_code == 200
    assert ok_delete.get_json()["success"] is True
