from io import BytesIO


def test_leased_line_diagram_crud(authed_client, actor_user_id):
    # Create a leased line first
    r = authed_client.post(
        "/api/network/leased-lines",
        json={
            "line_group": "G_MG",
            "org_name": "ORG-MG",
            "status_code": "ACTIVE",
            "line_no": "LL-DIAG-001",
            "actor_user_id": actor_user_id,
        },
    )
    assert r.status_code == 201, r.get_json()
    leased_id = r.get_json()["item"]["id"]

    # Initially empty
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/diagram")
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["success"] is True
    assert payload["item"] is None

    # Upload a small png
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"0" * 128
    data = {
        "file": (BytesIO(png_bytes), "diagram.png"),
        "actor_user_id": str(actor_user_id),
    }
    r = authed_client.post(
        f"/api/network/leased-lines/{leased_id}/diagram",
        data=data,
        content_type="multipart/form-data",
    )
    assert r.status_code == 201, r.get_json()
    item = r.get_json()["item"]
    assert item["line_id"] == leased_id
    assert item["original_name"] == "diagram.png"
    assert item["raw_url"].endswith(f"/api/network/leased-lines/{leased_id}/diagram/raw")

    # Get metadata
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/diagram")
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["success"] is True
    assert payload["item"] is not None
    assert payload["item"]["original_name"] == "diagram.png"

    # Raw fetch
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/diagram/raw")
    assert r.status_code == 200
    assert r.data.startswith(b"\x89PNG\r\n\x1a\n")

    # Delete
    r = authed_client.delete(
        f"/api/network/leased-lines/{leased_id}/diagram",
        json={"actor_user_id": actor_user_id},
    )
    assert r.status_code == 200
    assert r.get_json()["success"] is True

    # Metadata should now be empty
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/diagram")
    assert r.status_code == 200
    assert r.get_json()["item"] is None

    # Raw should 404
    r = authed_client.get(f"/api/network/leased-lines/{leased_id}/diagram/raw")
    assert r.status_code == 404
