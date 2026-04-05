import json
import time
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"


def request_json(method: str, path: str, payload=None):
    url = BASE + path
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw) if raw else None
        except Exception:
            body = {"_raw": raw}
        return e.code, body


def main():
    created_hardware_id = None
    try:
        # 1) Create a hardware asset to attach software rows to
        unique = str(time.time_ns())
        hw_payload = {"asset_code": f"SMOKE-SRV-ONP-{unique}", "asset_name": "SMOKE 서버"}
        status, body = request_json("POST", "/api/hardware/onpremise/assets", hw_payload)
        if status != 201:
            print("FAIL: create hardware", status, body)
            return 2
        created_hardware_id = body["item"]["id"]
        hardware_id = created_hardware_id
        print("OK: hardware created id=", hardware_id)

        # 2) Verify software list empty
        status, body = request_json("GET", f"/api/hardware/assets/{hardware_id}/software")
        if status != 200 or not body or body.get("success") is not True or body.get("total") != 0:
            print("FAIL: list empty", status, body)
            return 2
        print("OK: software list empty")

        # 3) Create software row
        sw_payload = {
            "type": "운영체제",
            "name": "Rocky Linux",
            "version": "9.3",
            "vendor": "Rocky",
            "qty": 1,
            "license_key": "N/A",
            "remark": "smoke",
        }
        status, body = request_json("POST", f"/api/hardware/assets/{hardware_id}/software", sw_payload)
        if status != 201:
            print("FAIL: create software", status, body)
            return 2
        sw_id = body["item"]["id"]
        print("OK: software created id=", sw_id)

        # 4) Update software row
        status, body = request_json(
            "PUT",
            f"/api/hardware/assets/{hardware_id}/software/{sw_id}",
            {"qty": 2, "remark": "smoke-updated"},
        )
        if status != 200 or body.get("item", {}).get("qty") != 2:
            print("FAIL: update software", status, body)
            return 2
        print("OK: software updated")

        # 5) Delete software row
        status, body = request_json("DELETE", f"/api/hardware/assets/{hardware_id}/software/{sw_id}")
        if status != 200:
            print("FAIL: delete software", status, body)
            return 2
        print("OK: software deleted")

        # 6) Verify software list empty again
        status, body = request_json("GET", f"/api/hardware/assets/{hardware_id}/software")
        if status != 200 or body.get("total") != 0:
            print("FAIL: list empty after delete", status, body)
            return 2
        print("OK: software list empty after delete")

        return 0
    finally:
        # Best-effort cleanup so the dev DB doesn't keep growing.
        if created_hardware_id is not None:
            request_json(
                "POST",
                "/api/hardware/onpremise/assets/bulk-delete",
                {"ids": [created_hardware_id]},
            )


if __name__ == "__main__":
    raise SystemExit(main())
