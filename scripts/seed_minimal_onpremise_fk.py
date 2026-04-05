import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import create_app
from app.services.hw_server_type_service import list_hw_server_types, create_hw_server_type
from app.services.org_center_service import list_org_centers, create_org_center
from app.services.org_rack_service import list_org_racks, create_org_rack


def _print(msg: str) -> None:
    print(msg, flush=True)


def main() -> int:
    app = create_app()
    app.app_context().push()

    actor = "system"

    centers = list_org_centers()
    if not centers:
        _print("[seed] org_center: empty -> creating 1")
        center = create_org_center(
            {
                "center_name": "센터A",
                "location": "서울",
                "usage": "DEV",
                "note": "seed",
            },
            actor,
        )
        centers = [center]
    _print(f"[seed] org_center: {len(centers)}")

    server_types = list_hw_server_types()
    if not server_types:
        _print("[seed] hw_server_type: empty -> creating 1")
        server_type = create_hw_server_type(
            {
                "model_name": "ProLiant DL360 Gen10",
                "manufacturer_code": "HPE",
                # JS filters onpremise model list by form_factor == '서버'
                "form_factor": "서버",
                "release_date": "2020-01-01",
                "eosl_date": "",
                "server_count": 0,
                "remark": "seed",
            },
            actor,
        )
        server_types = [server_type]
    _print(f"[seed] hw_server_type: {len(server_types)}")

    racks = list_org_racks()
    if not racks:
        _print("[seed] org_rack: empty -> creating 1")
        center_code = (centers[0].get("center_code") or "").strip()
        if not center_code:
            _print("[seed] ERROR: center_code missing after center create")
            return 2
        rack = create_org_rack(
            {
                "business_status_code": "가동",
                "business_name": "센터A 랙",
                "manufacturer_code": "HPE",
                "system_model_code": "",
                "serial_number": "",
                "center_code": center_code,
                "rack_position": "A-01",
                "system_height_u": 42,
                "remark": "seed",
            },
            actor,
        )
        racks = [rack]
    _print(f"[seed] org_rack: {len(racks)}")

    _print("[seed] done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
