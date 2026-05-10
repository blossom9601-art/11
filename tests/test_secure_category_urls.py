from app.services.public_id_service import resolve_public_id
from app.services.sw_os_type_service import create_sw_os_type
from app.services.vendor_manufacturer_service import create_vendor


def test_software_os_list_records_expose_public_id(app):
    with app.app_context():
        vendor = create_vendor({"manufacturer_name": "Secure Vendor"}, "tester")
        os_type = create_sw_os_type(
            {
                "model_name": "Secure OS",
                "manufacturer_code": vendor["manufacturer_code"],
                "os_type": "Linux",
            },
            "tester",
        )
        assert os_type["public_id"].startswith("os_")
        assert resolve_public_id("sw_os_type", "os", os_type["public_id"]) == os_type["id"]


def test_legacy_detail_url_redirects_to_clean_public_url(app, client):
    with app.app_context():
        vendor = create_vendor({"manufacturer_name": "Legacy Vendor"}, "tester")
        os_type = create_sw_os_type(
            {
                "model_name": "Legacy OS",
                "manufacturer_code": vendor["manufacturer_code"],
                "os_type": "Linux",
            },
            "tester",
        )

    response = client.get(
        "/p/cat_sw_os_detail"
        f"?id={os_type['id']}&model=Legacy%20OS&vendor=Legacy%20Vendor&server_code=SECRET",
        follow_redirects=True,
    )

    assert response.status_code == 200
    assert os_type["public_id"] in (response.request.path or response.request.url)


def test_legacy_b_page_redirects_to_b_segment(client):
    r = client.get("/b/page/cat_hw_dashboard", follow_redirects=False)
    assert r.status_code == 301
    loc = r.headers.get("Location", "")
    assert "/b/cat_hw_dashboard" in loc
    assert "/b/page/" not in loc


def test_legacy_p_cat_redirects_to_b_segment(client):
    r = client.get("/p/cat_hw_dashboard", follow_redirects=False)
    assert r.status_code == 301
    loc = r.headers.get("Location", "")
    assert "/b/cat_hw_dashboard" in loc
    assert "/b/page/" not in loc


def test_unknown_public_id_returns_404(client):
    response = client.get("/software/os/os_invalid")
    assert response.status_code == 404


def test_legacy_clean_public_url_redirects_to_opaque_url(app, client):
    with app.app_context():
        vendor = create_vendor({"manufacturer_name": "Legacy Clean Vendor"}, "tester")
        os_type = create_sw_os_type(
            {
                "model_name": "Legacy Clean OS",
                "manufacturer_code": vendor["manufacturer_code"],
                "os_type": "Linux",
            },
            "tester",
        )

    response = client.get(f"/software/os/{os_type['public_id']}")

    assert response.status_code == 302
    assert response.headers["Location"].endswith(f"/b/{os_type['public_id']}")


def test_opaque_url_strips_tampered_business_query(app, client):
    with app.app_context():
        vendor = create_vendor({"manufacturer_name": "Tamper Vendor"}, "tester")
        os_type = create_sw_os_type(
            {
                "model_name": "Tamper OS",
                "manufacturer_code": vendor["manufacturer_code"],
                "os_type": "Linux",
            },
            "tester",
        )

    response = client.get(f"/b/{os_type['public_id']}?model=Tamper&vendor=Leaked")

    assert response.status_code == 302
    location = response.headers["Location"]
    assert location.endswith(f"/b/{os_type['public_id']}")
    assert "model=" not in location
    assert "vendor=" not in location
