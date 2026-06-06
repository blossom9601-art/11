import sqlite3
from datetime import datetime
from pathlib import Path

from app.services.public_id_service import make_public_id, resolve_public_id
from app.services.hw_server_type_service import CREATE_TABLE_SQL as HW_SERVER_TYPE_TABLE_SQL
from app.services.hw_server_type_service import _resolve_db_path as _resolve_hw_db_path
from app.services.sw_os_type_service import create_sw_os_type
from app.services.vendor_manufacturer_service import create_vendor
from app.services.work_group_service import _resolve_db_path
from app.services.facility_security_infra_service import create_facility_security_infra_type, init_facility_security_infra_table


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ID_LIST_FILES = [
    "static/js/9.category/9-3.software/9-3-1.os/1.os_list.js",
    "static/js/9.category/9-3.software/9-3-2.database/1.database_list.js",
    "static/js/9.category/9-3.software/9-3-3.middleware/1.middleware_list.js",
    "static/js/9.category/9-3.software/9-3-4.virtualization/1.virtualization_list.js",
    "static/js/9.category/9-3.software/9-3-5.security/1.security_list.js",
    "static/js/9.category/9-3.software/9-3-6.high_availability/1.high_availability_list.js",
    "static/js/9.category/9-2.hardware/9-2-2.storage/1.storage_list.js",
    "static/js/9.category/9-2.hardware/9-2-3.san/1.san_list.js",
    "static/js/9.category/9-2.hardware/9-2-4.network/1.network_list.js",
    "static/js/9.category/9-2.hardware/9-2-5.security/1.security_list.js",
]
COMPONENT_PUBLIC_ID_LIST_FILES = [
    "static/js/9.category/9-4.component/9-4-1.cpu/1.cpu_list.js",
    "static/js/9.category/9-4.component/9-4-2.gpu/1.gpu_list.js",
    "static/js/9.category/9-4.component/9-4-3.memory/1.memory_list.js",
    "static/js/9.category/9-4.component/9-4-4.disk/1.disk_list.js",
    "static/js/9.category/9-4.component/9-4-5.nic/1.nic_list.js",
    "static/js/9.category/9-4.component/9-4-6.hba/1.hba_list.js",
    "static/js/9.category/9-4.component/9-4-7.etc/1.etc_list.js",
]


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


def test_public_id_list_normalizers_preserve_detail_ids():
    for relative_path in PUBLIC_ID_LIST_FILES:
        text = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "public_id: String(item.public_id || '').trim()" in text


def test_component_list_normalizers_preserve_detail_ids():
    for relative_path in COMPONENT_PUBLIC_ID_LIST_FILES:
        text = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "public_id: item.public_id ?? item.publicId ?? ''" in text


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


def test_business_group_public_url_renders_detail(app, client):
    with app.app_context():
        public_id = "bg_secureBiz001"
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with sqlite3.connect(_resolve_db_path(app)) as conn:
            conn.execute("DROP TABLE IF EXISTS biz_work_group")
            conn.execute(
                """
                CREATE TABLE biz_work_group (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    public_id TEXT UNIQUE,
                    group_code TEXT NOT NULL UNIQUE,
                    group_name TEXT NOT NULL,
                    description TEXT,
                    status_code TEXT NOT NULL,
                    dept_code TEXT NOT NULL,
                    member_count INTEGER DEFAULT 0,
                    hw_count INTEGER DEFAULT 0,
                    sw_count INTEGER DEFAULT 0,
                    priority INTEGER DEFAULT 0,
                    remark TEXT,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    updated_at TEXT,
                    updated_by TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                """
                INSERT INTO biz_work_group (
                    public_id, group_code, group_name, description, status_code,
                    dept_code, created_at, created_by, updated_at, updated_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (public_id, "SECURE_BIZ", "Secure Biz", "Secure business detail", "운영", "SEC", now, "tester", now, "tester"),
            )
            conn.commit()

    response = client.get(f"/b/{public_id}")

    assert response.status_code == 200
    assert b"cat_business_group_detail" in response.data


def test_hardware_server_public_url_renders_detail(app, client):
    with app.app_context():
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with sqlite3.connect(_resolve_hw_db_path(app)) as conn:
            conn.execute("DROP TABLE IF EXISTS hw_server_type")
            conn.execute(HW_SERVER_TYPE_TABLE_SQL)
            cur = conn.execute(
                """
                INSERT INTO hw_server_type (
                    server_code, model_name, manufacturer_code, form_factor,
                    created_at, created_by, updated_at, updated_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                ("SECURE_SERVER", "Secure Server", "HWV", "서버", now, "tester", now, "tester"),
            )
            server_id = cur.lastrowid
            conn.commit()
        public_id = make_public_id("hw_server_type", "srv", server_id)

    response = client.get(f"/b/{public_id}")

    assert response.status_code == 200
    assert b"cat_hw_server_detail" in response.data


def test_software_os_public_url_renders_detail(app, client):
    with app.app_context():
        vendor = create_vendor({"manufacturer_name": "OS Detail Vendor"}, "tester")
        os_type = create_sw_os_type(
            {
                "model_name": "OS Detail Model",
                "manufacturer_code": vendor["manufacturer_code"],
                "os_type": "Linux",
            },
            "tester",
        )

    response = client.get(f"/b/{os_type['public_id']}")

    assert response.status_code == 200
    assert b"cat_sw_os_detail" in response.data


def test_facility_security_public_url_renders_and_owns_tabs(app, client):
    with app.app_context():
        init_facility_security_infra_table(app)
        item = create_facility_security_infra_type(
            "fire_extinguishing",
            {
                "model_name": "Secure Fire Extinguisher",
                "manufacturer_name": "HPE",
                "infra_count": 1,
            },
            "tester",
        )

    public_id = item["public_id"]
    assert public_id.startswith("fsfire_")

    response = client.get(f"/b/{public_id}")
    assert response.status_code == 200
    assert b"cat_facility_security_fire_extinguishing_detail" in response.data
    assert f'href="/b/{public_id}?tab=system"'.encode() in response.data
    assert f'href="/b/{public_id}?tab=log"'.encode() in response.data
    assert b"/b/cat_facility_security_fire_extinguishing_system" not in response.data

    legacy_response = client.get("/b/cat_facility_security_fire_extinguishing_detail")
    assert legacy_response.status_code == 302
    assert legacy_response.headers["Location"].endswith(f"/b/{public_id}")


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
