import sqlite3
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "scripts" / "sql" / "hardware_asset_schema.sql"


def _bootstrap_hardware_asset_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        with SCHEMA_PATH.open("r", encoding="utf-8") as schema_file:
            conn.executescript(schema_file.read())


def test_duplicate_asset_code_is_autoresolved(client, app, tmp_path):
    db_path = tmp_path / "hardware_asset.db"
    app.config["HARDWARE_ASSET_DB_PATH"] = str(db_path)
    _bootstrap_hardware_asset_db(db_path)

    payload = {
        "asset_code": "SRV-ONP-AUTO-0001",
        "asset_name": "테스트 서버",
    }

    first_response = client.post("/api/hardware/onpremise/assets", json=payload)
    assert first_response.status_code == 201
    first_body = first_response.get_json()
    assert first_body["success"] is True
    first_code = first_body["item"]["asset_code"]
    assert first_code == payload["asset_code"]

    second_response = client.post("/api/hardware/onpremise/assets", json=payload)
    assert second_response.status_code == 201
    second_body = second_response.get_json()
    assert second_body["success"] is True
    second_code = second_body["item"]["asset_code"]

    assert second_code != first_code
    assert second_code.startswith(payload["asset_code"])


def test_network_circuit_asset_search_matches_manufacturer_and_model(client, app, tmp_path):
    db_path = tmp_path / "hardware_asset.db"
    app.config["HARDWARE_ASSET_DB_PATH"] = str(db_path)
    _bootstrap_hardware_asset_db(db_path)

    # Seed lookup tables so FK constraints allow saving manufacturer_code/server_code.
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO biz_work_status (status_code, status_name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            ("RUN", "운영", "2026-01-10T00:00:00Z", "pytest"),
        )
        conn.execute(
            "INSERT INTO biz_vendor_manufacturer (manufacturer_code, manufacturer_name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            ("CISCO", "Cisco Systems", "2026-01-10T00:00:00Z", "pytest"),
        )
        conn.execute(
            "INSERT INTO hw_server_type (server_code, model_name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            ("NCS540", "NCS 540", "2026-01-10T00:00:00Z", "pytest"),
        )
        conn.commit()

    payload = {
        "asset_code": "NET-CIR-0001",
        "asset_name": "회선장비 테스트",
        "work_status": "RUN",
        "work_name": "pytest 업무",
        "system_name": "pytest 시스템",
        "manufacturer_code": "CISCO",
        "server_code": "NCS540",
    }
    create_res = client.post("/api/hardware/network/circuit/assets", json=payload)
    assert create_res.status_code == 201, create_res.get_json()
    assert create_res.get_json()["success"] is True

    # Search by manufacturer name (not just code)
    by_vendor = client.get("/api/hardware/network/circuit/assets?q=Cisco")
    assert by_vendor.status_code == 200
    body_vendor = by_vendor.get_json()
    assert body_vendor["success"] is True
    assert body_vendor["total"] == 1
    assert len(body_vendor["items"]) == 1

    # Search by model name
    by_model = client.get("/api/hardware/network/circuit/assets?q=NCS")
    assert by_model.status_code == 200
    body_model = by_model.get_json()
    assert body_model["success"] is True
    assert body_model["total"] == 1
    assert len(body_model["items"]) == 1


def test_onpremise_asset_put_allows_clearing_security_and_flags(client, app, tmp_path):
    db_path = tmp_path / "hardware_asset.db"
    app.config["HARDWARE_ASSET_DB_PATH"] = str(db_path)
    _bootstrap_hardware_asset_db(db_path)

    create_payload = {
        "asset_code": "SRV-ONP-CLR-0001",
        "asset_name": "지움 테스트 서버",
        "cia_confidentiality": 1,
        "cia_integrity": 2,
        "cia_availability": 3,
        "system_grade": "1등급",
        "core_flag": "핵심",
        "dr_built": "O",
        "svc_redundancy": "O",
    }
    created = client.post("/api/hardware/onpremise/assets", json=create_payload)
    assert created.status_code == 201
    created_body = created.get_json()
    assert created_body["success"] is True
    asset_id = created_body["item"]["id"]

    update_payload = {
        "cia_confidentiality": None,
        "cia_integrity": None,
        "cia_availability": None,
        "security_score": None,
        "system_grade": None,
        "core_flag": None,
        "dr_built": None,
        "svc_redundancy": None,
    }
    updated = client.put(f"/api/hardware/onpremise/assets/{asset_id}", json=update_payload)
    assert updated.status_code == 200
    updated_body = updated.get_json()
    assert updated_body["success"] is True
    item = updated_body["item"]

    assert item["cia_confidentiality"] is None
    assert item["cia_integrity"] is None
    assert item["cia_availability"] is None
    assert item["security_score"] is None
    assert item["system_grade"] is None
    assert item["is_core_system"] is None
    assert item["has_dr_site"] is None
    assert item["has_service_ha"] is None

    fetched = client.get(f"/api/hardware/onpremise/assets/{asset_id}")
    assert fetched.status_code == 200
    fetched_body = fetched.get_json()
    assert fetched_body["success"] is True
    fresh = fetched_body["item"]

    assert fresh["cia_confidentiality"] is None
    assert fresh["cia_integrity"] is None
    assert fresh["cia_availability"] is None
    assert fresh["security_score"] is None
    assert fresh["system_grade"] is None
    assert fresh["is_core_system"] is None
    assert fresh["has_dr_site"] is None
    assert fresh["has_service_ha"] is None


def test_onpremise_owner_display_is_persisted_and_used_as_fallback(client, app, tmp_path):
    db_path = tmp_path / "hardware_asset.db"
    app.config["HARDWARE_ASSET_DB_PATH"] = str(db_path)
    _bootstrap_hardware_asset_db(db_path)

    emp_no = "20261234"
    name = "홍길동"

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO org_user (emp_no, name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            (emp_no, name, "2026-01-11T00:00:00Z", "pytest"),
        )
        conn.commit()

    create_payload = {
        "asset_code": "SRV-ONP-OWN-0001",
        "asset_name": "담당자 표시 저장 테스트",
        "system_owner": emp_no,
        "system_owner_display": name,
    }
    created = client.post("/api/hardware/onpremise/assets", json=create_payload)
    assert created.status_code == 201
    created_item = created.get_json()["item"]
    asset_id = created_item["id"]

    assert created_item["system_owner_emp_no"] == emp_no
    assert created_item["system_owner_display"] == name
    assert created_item["system_owner_name"] == name

    # Simulate missing org_user.name (join returns NULL): API should still show stored display.
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE org_user SET name = NULL WHERE emp_no = ?", (emp_no,))
        conn.commit()

    fetched = client.get(f"/api/hardware/onpremise/assets/{asset_id}")
    assert fetched.status_code == 200
    item = fetched.get_json()["item"]
    assert item["system_owner_emp_no"] == emp_no
    assert item["system_owner_display"] == name
    assert item["system_owner_name"] == name


def test_frame_asset_put_maps_ui_alias_fk_fields(client, app, tmp_path):
    db_path = tmp_path / "hardware_asset.db"
    app.config["HARDWARE_ASSET_DB_PATH"] = str(db_path)
    _bootstrap_hardware_asset_db(db_path)

    center_code = "CTR-001"
    rack_code = "RACK-001"
    sys_dept_code = "D-SYS"
    svc_dept_code = "D-SVC"
    sys_emp_no = "20260001"
    svc_emp_no = "20260002"

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO org_center (center_code, center_name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            (center_code, "센터A", "2026-01-11T00:00:00Z", "pytest"),
        )
        conn.execute(
            "INSERT INTO org_department (dept_code, dept_name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            (sys_dept_code, "시스템부서", "2026-01-11T00:00:00Z", "pytest"),
        )
        conn.execute(
            "INSERT INTO org_department (dept_code, dept_name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            (svc_dept_code, "서비스부서", "2026-01-11T00:00:00Z", "pytest"),
        )
        conn.execute(
            "INSERT INTO org_user (emp_no, name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            (sys_emp_no, "시스템담당", "2026-01-11T00:00:00Z", "pytest"),
        )
        conn.execute(
            "INSERT INTO org_user (emp_no, name, created_at, created_by, is_deleted) VALUES (?, ?, ?, ?, 0)",
            (svc_emp_no, "서비스담당", "2026-01-11T00:00:00Z", "pytest"),
        )
        conn.execute(
            """
            INSERT INTO org_rack (
                rack_code,
                business_status_code,
                business_name,
                manufacturer_code,
                system_model_code,
                serial_number,
                center_code,
                rack_position,
                system_height_u,
                system_dept_code,
                system_manager_id,
                service_dept_code,
                service_manager_id,
                created_at,
                created_by,
                is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                rack_code,
                "RUN",
                "pytest rack",
                "VENDOR",
                "MODEL",
                "SN-001",
                center_code,
                "R1",
                42,
                sys_dept_code,
                1,
                svc_dept_code,
                2,
                "2026-01-11T00:00:00Z",
                "pytest",
            ),
        )
        conn.commit()

    create_payload = {
        "asset_code": "FRM-0001",
        "asset_name": "프레임 테스트",
    }
    created = client.post("/api/hardware/frame/assets", json=create_payload)
    assert created.status_code == 201
    asset_id = created.get_json()["item"]["id"]

    update_payload = {
        "location_place": center_code,
        "location_pos": rack_code,
        "sys_dept": sys_dept_code,
        "sys_owner": sys_emp_no,
        "svc_dept": svc_dept_code,
        "svc_owner": svc_emp_no,
    }
    updated = client.put(f"/api/hardware/frame/assets/{asset_id}", json=update_payload)
    assert updated.status_code == 200
    item = updated.get_json()["item"]

    assert item["center_code"] == center_code
    assert item["rack_code"] == rack_code
    assert item["system_dept_code"] == sys_dept_code
    assert item["system_owner_emp_no"] == sys_emp_no
    assert item["service_dept_code"] == svc_dept_code
    assert item["service_owner_emp_no"] == svc_emp_no

    assert item["center_name"] == "센터A"
    assert item["rack_name"] == "R1"
    assert item["system_dept_name"] == "시스템부서"
    assert item["service_dept_name"] == "서비스부서"
    assert item["system_owner_name"] == "시스템담당"
    assert item["service_owner_name"] == "서비스담당"


def test_frame_asset_put_updates_serial_number(client, app, tmp_path):
    db_path = tmp_path / "hardware_asset.db"
    app.config["HARDWARE_ASSET_DB_PATH"] = str(db_path)
    _bootstrap_hardware_asset_db(db_path)

    create_payload = {
        "asset_code": "SRV-FRM-SN-0001",
        "asset_name": "프레임 일련번호 테스트",
    }
    created = client.post("/api/hardware/frame/assets", json=create_payload)
    assert created.status_code == 201
    asset_id = created.get_json()["item"]["id"]

    updated = client.put(f"/api/hardware/frame/assets/{asset_id}", json={"serial_number": "SN-ABC-123"})
    assert updated.status_code == 200
    body = updated.get_json()
    assert body["success"] is True
    assert body["item"]["serial_number"] == "SN-ABC-123"

    fetched = client.get(f"/api/hardware/frame/assets/{asset_id}")
    assert fetched.status_code == 200
    item = fetched.get_json()["item"]
    assert item["serial_number"] == "SN-ABC-123"
