"""Smoke check: tab42-manager persistence via HTTP (auth).

Validates end-to-end CRUD for the newly DB-backed manager tabs:
- Vendor Manufacturer managers
- Vendor Maintenance managers
- VPN Line managers

Requires running server on http://127.0.0.1:8080

Env vars:
- BLOSSOM_EMPLOYEE_ID or BLOSSOM_EMP_NO: login id
- BLOSSOM_PASSWORD: login password
- BLOSSOM_BASE (optional): base URL (default http://127.0.0.1:8080)

Usage:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/_smoke_check_tab42_managers_http_auth.py
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


def _env_first(*keys: str) -> str:
    for key in keys:
        val = (os.environ.get(key) or "").strip()
        if val:
            return val
    return ""


BASE = _env_first("BLOSSOM_BASE") or "http://127.0.0.1:8080"
BASE = BASE.rstrip("/")


def _cookie_opener():
    jar = urllib.request.HTTPCookieProcessor()
    opener = urllib.request.build_opener(jar)
    return opener


def _req(
    opener,
    method: str,
    path: str,
    *,
    form=None,
    json_body=None,
    timeout=10,
    headers=None,
):
    url = BASE + path
    data = None
    hdrs = dict(headers or {})

    if form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded")

    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")

    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with opener.open(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, body, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        return e.code, body, dict(getattr(e, "headers", {}) or {})


def _get_json(opener, method: str, path: str, *, json_body=None):
    status, body, headers = _req(opener, method, path, json_body=json_body)
    try:
        return status, json.loads(body), headers
    except Exception:
        return status, {"_raw": body}, headers


def _must_json(opener, method: str, path: str, *, json_body=None, ok_statuses=(200,)) -> dict:
    status, data, _headers = _get_json(opener, method, path, json_body=json_body)
    if status not in ok_statuses:
        raise AssertionError(f"{method} {path} unexpected status={status} body={data}")
    if not isinstance(data, dict) or data.get("success") is not True:
        raise AssertionError(f"{method} {path} unexpected payload={data}")
    return data


def login(opener, employee_id: str, password: str) -> bool:
    _req(opener, "GET", "/login")

    status, body, _headers = _req(
        opener,
        "POST",
        "/login",
        form={"employee_id": employee_id, "password": password},
        headers={"Referer": BASE + "/login"},
    )

    if status in (301, 302, 303, 307, 308):
        return True

    if status == 200 and ("로그인" not in body) and ("flash-" not in body):
        return True

    return False


def _resolve_actor_user_id(opener, emp_no: str) -> int:
    q = urllib.parse.quote(emp_no)
    status, data, _ = _get_json(opener, "GET", f"/api/user-profiles?q={q}&limit=50")
    if status != 200 or not isinstance(data, dict) or data.get("success") is not True:
        raise AssertionError(f"Failed to query /api/user-profiles status={status} body={data}")
    items = data.get("items") or []
    for item in items:
        if (item.get("emp_no") or "").strip() == emp_no and int(item.get("id") or 0) > 0:
            return int(item["id"])
    for item in items:
        if int(item.get("id") or 0) > 0:
            return int(item["id"])
    raise AssertionError(f"Could not resolve actor user id for emp_no={emp_no}")


def _ensure_vendor_manufacturer(opener) -> int:
    vendors = _must_json(opener, "GET", "/api/vendor-manufacturers")
    items = vendors.get("items") or []
    if items:
        return int(items[0]["id"])

    name = f"SMOKE-MANUFACTURER-{int(time.time())}"
    created = _must_json(opener, "POST", "/api/vendor-manufacturers", json_body={"manufacturer_name": name}, ok_statuses=(201,))
    return int(created["item"]["id"])


def _ensure_vendor_maintenance(opener) -> int:
    vendors = _must_json(opener, "GET", "/api/vendor-maintenance")
    items = vendors.get("items") or []
    if items:
        return int(items[0]["id"])

    name = f"SMOKE-MAINTENANCE-{int(time.time())}"
    created = _must_json(opener, "POST", "/api/vendor-maintenance", json_body={"maintenance_name": name}, ok_statuses=(201,))
    return int(created["item"]["id"])


def _crud_vendor_manufacturer_managers(opener, vendor_id: int) -> None:
    base = f"/api/vendor-manufacturers/{vendor_id}/managers"

    _must_json(opener, "GET", base)

    created = _must_json(
        opener,
        "POST",
        base,
        json_body={"org": "SMOKE", "name": "Smoke Vendor Mgr", "role": "담당", "phone": "010-0000-0000", "email": "", "remark": "smoke"},
        ok_statuses=(201,),
    )
    manager_id = int(created["item"]["id"])

    updated = _must_json(
        opener,
        "PUT",
        f"{base}/{manager_id}",
        json_body={"remark": "smoke-updated"},
        ok_statuses=(200,),
    )
    assert updated["item"].get("remark") == "smoke-updated"

    _must_json(opener, "DELETE", f"{base}/{manager_id}", ok_statuses=(200,))

    after = _must_json(opener, "GET", base)
    ids = {int(x.get("id") or 0) for x in (after.get("items") or [])}
    assert manager_id not in ids, ("manufacturer manager should be deleted", manager_id, ids)


def _crud_vendor_maintenance_managers(opener, vendor_id: int) -> None:
    base = f"/api/vendor-maintenance/{vendor_id}/managers"

    _must_json(opener, "GET", base)

    created = _must_json(
        opener,
        "POST",
        base,
        json_body={"org": "SMOKE", "name": "Smoke Maint Mgr", "role": "담당", "phone": "010-0000-0000", "email": "", "remark": "smoke"},
        ok_statuses=(201,),
    )
    manager_id = int(created["item"]["id"])

    updated = _must_json(
        opener,
        "PUT",
        f"{base}/{manager_id}",
        json_body={"remark": "smoke-updated"},
        ok_statuses=(200,),
    )
    assert updated["item"].get("remark") == "smoke-updated"

    _must_json(opener, "DELETE", f"{base}/{manager_id}", ok_statuses=(200,))

    after = _must_json(opener, "GET", base)
    ids = {int(x.get("id") or 0) for x in (after.get("items") or [])}
    assert manager_id not in ids, ("maintenance manager should be deleted", manager_id, ids)


def _ensure_vpn_line(opener, *, actor_user_id: int) -> tuple[int, bool, int]:
    lines = _must_json(opener, "GET", "/api/network/vpn-lines?scope=VPN1")
    items = lines.get("items") or []
    if items:
        return int(items[0]["id"]), False, 0

    partner = _must_json(
        opener,
        "POST",
        "/api/network/vpn-partners",
        json_body={
            "org_name": f"SMOKE-VPN-PARTNER-{int(time.time())}",
            "partner_type": "VPN1",
            "note": "smoke",
            "created_by_user_id": actor_user_id,
        },
        ok_statuses=(201,),
    )["item"]
    partner_id = int(partner["id"])

    line = _must_json(
        opener,
        "POST",
        "/api/network/vpn-lines",
        json_body={
            "vpn_partner_id": partner_id,
            "scope": "VPN1",
            "status": "운용",
            "line_speed": "100M",
            "line_count": 1,
            "protocol": "TCP",
            "manager": "smoke",
            "cipher": "AES-256",
            "upper_country": "UP-SMOKE",
            "lower_country": "LOW-SMOKE",
            "note": "smoke",
            "created_by_user_id": actor_user_id,
        },
        ok_statuses=(201,),
    )["item"]

    return int(line["id"]), True, partner_id


def _cleanup_vpn_seed(opener, *, actor_user_id: int, line_id: int, partner_id: int) -> None:
    try:
        _get_json(opener, "DELETE", f"/api/network/vpn-lines/{line_id}?actor_user_id={actor_user_id}")
    except Exception:
        pass
    try:
        _get_json(opener, "DELETE", f"/api/network/vpn-partners/{partner_id}?actor_user_id={actor_user_id}")
    except Exception:
        pass


def _crud_vpn_line_managers(opener, line_id: int) -> None:
    base = f"/api/network/vpn-lines/{line_id}/managers"

    _must_json(opener, "GET", base)

    created = _must_json(
        opener,
        "POST",
        base,
        json_body={
            "org": "SMOKE",
            "name": "Smoke VPN Mgr",
            "role": "담당",
            "phone": "010-0000-0000",
            "email": "smoke@example.com",
            "remark": "smoke",
        },
        ok_statuses=(201,),
    )
    manager_id = int(created["item"]["id"])

    updated = _must_json(
        opener,
        "PUT",
        f"{base}/{manager_id}",
        json_body={"remark": "smoke-updated"},
        ok_statuses=(200,),
    )
    assert updated["item"].get("remark") == "smoke-updated"

    _must_json(opener, "DELETE", f"{base}/{manager_id}", ok_statuses=(200,))

    after = _must_json(opener, "GET", base)
    ids = {int(x.get("id") or 0) for x in (after.get("items") or [])}
    assert manager_id not in ids, ("vpn manager should be deleted", manager_id, ids)


def main() -> int:
    emp = _env_first("BLOSSOM_EMPLOYEE_ID", "BLOSSOM_EMP_NO").strip() or "ADMIN"
    pw = _env_first("BLOSSOM_PASSWORD").strip() or "Passw0rd"

    if not _env_first("BLOSSOM_EMPLOYEE_ID", "BLOSSOM_EMP_NO") or not _env_first("BLOSSOM_PASSWORD"):
        print("[WARN] env vars missing; using defaults emp_no=ADMIN / password=Passw0rd")

    opener = _cookie_opener()

    try:
        ok = login(opener, emp, pw)
    except Exception as e:
        print("[FAIL] cannot reach server", BASE, "error=", repr(e))
        return 1

    if not ok:
        print("[FAIL] login failed (check credentials)")
        return 1

    print("[OK] login")

    actor_user_id = _resolve_actor_user_id(opener, emp)
    print("[OK] actor_user_id=", actor_user_id)

    manufacturer_id = _ensure_vendor_manufacturer(opener)
    print("[OK] vendor manufacturer id=", manufacturer_id)
    _crud_vendor_manufacturer_managers(opener, manufacturer_id)
    print("[OK] vendor manufacturer managers CRUD")

    maintenance_id = _ensure_vendor_maintenance(opener)
    print("[OK] vendor maintenance id=", maintenance_id)
    _crud_vendor_maintenance_managers(opener, maintenance_id)
    print("[OK] vendor maintenance managers CRUD")

    line_id, created_seed, partner_id = _ensure_vpn_line(opener, actor_user_id=actor_user_id)
    print("[OK] vpn line id=", line_id, "(seed_created=", created_seed, ")")

    try:
        _crud_vpn_line_managers(opener, line_id)
        print("[OK] vpn line managers CRUD")
    finally:
        if created_seed and partner_id:
            _cleanup_vpn_seed(opener, actor_user_id=actor_user_id, line_id=line_id, partner_id=partner_id)

    print("[ok] tab42 manager HTTP smoke check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
