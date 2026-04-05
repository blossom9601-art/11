import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"


def request_json(method: str, path: str, payload=None, *, headers=None):
    url = BASE + path
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
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


def main() -> int:
    # Match the UI scoping scheme for 3.software detail pages:
    # scope_key = "3.software:<asset_scope>:<asset_id>"
    unique = int(time.time_ns() % 10_000_000_000)
    scope_key = f"3.software:unix:{unique}"

    created_ids: list[int] = []
    try:
        # 1) list should be empty
        status, body = request_json("GET", f"/api/sw-system-allocations?scope_key={urllib.parse.quote(scope_key)}&page=1&page_size=50")
        if status != 200 or not body or body.get("total") != 0:
            print("FAIL: list empty", status, body)
            return 2
        print("OK: list empty")

        # 2) create (license_quantity variant)
        payload_qty = {
            "scope_key": scope_key,
            "work_status": "가동",
            "work_group": "",
            "work_name": "SMOKE-WORK",
            "system_name": "SMOKE-SYS-1",
            "system_ip": "10.0.0.1",
            "software_detail_version": "",
            "license_quantity": 3,
            "remark": "smoke",
        }
        status, body = request_json(
            "POST",
            "/api/sw-system-allocations",
            payload_qty,
            headers={"X-Actor": "smoke"},
        )
        if status != 201 or not body or body.get("scope_key") != scope_key:
            print("FAIL: create license_quantity row", status, body)
            return 2
        alloc_id_qty = int(body["id"])
        created_ids.append(alloc_id_qty)
        print("OK: created license_quantity row id=", alloc_id_qty)

        # 3) create (software_detail_version variant)
        payload_ver = {
            "scope_key": scope_key,
            "work_status": "유휴",
            "work_group": "",
            "work_name": "SMOKE-WORK",
            "system_name": "SMOKE-SYS-2",
            "system_ip": "10.0.0.2",
            "software_detail_version": "v1.2.3",
            "license_quantity": None,
            "remark": "smoke-ver",
        }
        status, body = request_json(
            "POST",
            "/api/sw-system-allocations",
            payload_ver,
            headers={"X-Actor": "smoke"},
        )
        if status != 201 or not body or body.get("software_detail_version") != "v1.2.3":
            print("FAIL: create version row", status, body)
            return 2
        alloc_id_ver = int(body["id"])
        created_ids.append(alloc_id_ver)
        print("OK: created version row id=", alloc_id_ver)

        # 4) list should include 2
        status, body = request_json("GET", f"/api/sw-system-allocations?scope_key={urllib.parse.quote(scope_key)}&page=1&page_size=50")
        if status != 200 or not body or body.get("total") != 2:
            print("FAIL: list after create", status, body)
            return 2
        ids = [it.get("id") for it in (body.get("items") or [])]
        if alloc_id_qty not in ids or alloc_id_ver not in ids:
            print("FAIL: list missing ids", status, body)
            return 2
        print("OK: list contains both rows")

        # 5) update first row
        status, body = request_json(
            "PUT",
            f"/api/sw-system-allocations/{alloc_id_qty}",
            {"scope_key": scope_key, "license_quantity": 4, "remark": "smoke-updated"},
            headers={"X-Actor": "smoke"},
        )
        if status != 200 or not body or body.get("license_quantity") != 4:
            print("FAIL: update", status, body)
            return 2
        print("OK: update verified")

        # 6) delete both rows (must include scope_key)
        for alloc_id in [alloc_id_qty, alloc_id_ver]:
            status, body = request_json("DELETE", f"/api/sw-system-allocations/{alloc_id}?scope_key={urllib.parse.quote(scope_key)}")
            if status != 200 or not body or body.get("ok") is not True:
                print("FAIL: delete", alloc_id, status, body)
                return 2
        created_ids.clear()
        print("OK: deletes verified")

        # 7) list empty again
        status, body = request_json("GET", f"/api/sw-system-allocations?scope_key={urllib.parse.quote(scope_key)}&page=1&page_size=50")
        if status != 200 or not body or body.get("total") != 0:
            print("FAIL: list empty after delete", status, body)
            return 2
        print("OK: list empty after delete")
        return 0

    finally:
        # Best-effort cleanup in case we failed mid-run
        for alloc_id in created_ids:
            try:
                request_json(
                    "DELETE",
                    f"/api/sw-system-allocations/{alloc_id}?scope_key={urllib.parse.quote(scope_key)}",
                )
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
