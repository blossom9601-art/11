import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"
TIMEOUT = 10


def _get_json(path: str):
    req = urllib.request.Request(
        BASE + path,
        method="GET",
        headers={"Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def _post_json(path: str, payload: dict):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8", "replace"))


def main() -> int:
    try:
        vendors = _get_json("/api/vendor-manufacturers")
        if not vendors.get("success"):
            print("[seed:http] vendor-manufacturers not success", vendors)
            return 2
        vendor_codes = {str(it.get("manufacturer_code") or "").strip() for it in (vendors.get("items") or [])}
        if "HPE" not in vendor_codes:
            print("[seed:http] WARNING: HPE vendor not found; hw-server-type create may fail")

        centers = _get_json("/api/org-centers")
        if not centers.get("success"):
            print("[seed:http] org-centers not success", centers)
            return 2
        if (centers.get("total") or 0) == 0:
            status, created = _post_json(
                "/api/org-centers",
                {"center_name": "센터A", "location": "서울", "usage": "DEV", "note": "seed"},
            )
            print("[seed:http] POST /api/org-centers", status, created.get("success"))
            if status >= 400 or not created.get("success"):
                print(created)
                return 3
            center_code = (created.get("item") or {}).get("center_code")
        else:
            center_code = (centers.get("items") or [{}])[0].get("center_code")
        center_code = str(center_code or "").strip()
        print("[seed:http] center_code=", center_code)

        racks = _get_json("/api/org-racks")
        if not racks.get("success"):
            print("[seed:http] org-racks not success", racks)
            return 2
        if (racks.get("total") or 0) == 0:
            status, created = _post_json(
                "/api/org-racks",
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
            )
            print("[seed:http] POST /api/org-racks", status, created.get("success"))
            if status >= 400 or not created.get("success"):
                print(created)
                return 3

        server_types = _get_json("/api/hw-server-types")
        if not server_types.get("success"):
            print("[seed:http] hw-server-types not success", server_types)
            return 2
        if (server_types.get("total") or 0) == 0:
            status, created = _post_json(
                "/api/hw-server-types",
                {
                    "model_name": "ProLiant DL360 Gen10",
                    "manufacturer_code": "HPE",
                    "form_factor": "서버",
                    "release_date": "2020-01-01",
                    "eosl_date": "",
                    "server_count": 0,
                    "remark": "seed",
                },
            )
            print("[seed:http] POST /api/hw-server-types", status, created.get("success"))
            if status >= 400 or not created.get("success"):
                print(created)
                return 3

        # Verify
        centers2 = _get_json("/api/org-centers")
        racks2 = _get_json("/api/org-racks")
        types2 = _get_json("/api/hw-server-types")
        print("[seed:http] verify totals:")
        print("  org-centers:", centers2.get("total"))
        print("  org-racks:", racks2.get("total"))
        print("  hw-server-types:", types2.get("total"))
        return 0

    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        print("HTTPError", exc.code, body)
        return 10
    except Exception as exc:
        print("EXC", type(exc).__name__, str(exc))
        return 11


if __name__ == "__main__":
    raise SystemExit(main())
