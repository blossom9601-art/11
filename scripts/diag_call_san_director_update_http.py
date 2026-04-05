import os
from typing import Any, Dict

import requests


def _head(text: str, n: int = 400) -> str:
    text = (text or "").replace("\r\n", "\n")
    return text[:n]


def _safe_json(resp: requests.Response) -> Dict[str, Any]:
    try:
        data = resp.json()
        return data if isinstance(data, dict) else {"_json": data}
    except Exception:
        return {"_raw": _head(resp.text)}


def main() -> int:
    base = os.environ.get("BLOSSOM_BASE", "http://127.0.0.1:8080").rstrip("/")
    emp_no = os.environ.get("BLOSSOM_EMP_NO", "ADMIN")
    password = os.environ.get("BLOSSOM_PASSWORD", "Passw0rd")

    api_list = f"{base}/api/hardware/san/director/assets?page_size=5"

    s = requests.Session()

    # Login (form POST)
    s.get(f"{base}/login", allow_redirects=True, timeout=10)
    r_login = s.post(
        f"{base}/login",
        data={"employee_id": emp_no, "password": password},
        allow_redirects=True,
        timeout=10,
    )
    print("LOGIN", r_login.status_code, "final_url", r_login.url)

    # List
    r_list = s.get(api_list, headers={"Accept": "application/json"}, timeout=10)
    print("GET", api_list, "->", r_list.status_code)
    data = _safe_json(r_list)
    if r_list.status_code != 200:
        print("LIST_FAIL", data)
        return 2

    items = data.get("items")
    if not isinstance(items, list) or not items:
        print("NO_ITEMS")
        return 0

    asset_id = items[0].get("id")
    print("FIRST_ID", asset_id)
    if not isinstance(asset_id, int):
        print("BAD_ID", items[0])
        return 3

    # Safe update (no-op): json={} should not modify fields; service returns current record.
    url_put = f"{base}/api/hardware/san/director/assets/{asset_id}"
    r_put = s.put(url_put, json={}, headers={"Accept": "application/json"}, timeout=10)
    print("PUT(no-op)", url_put, "->", r_put.status_code)
    print("PUT_BODY_HEAD", _safe_json(r_put))

    # Owner update test: frontend uses alias keys system_owner/service_owner.
    # This should map to system_owner_emp_no/service_owner_emp_no in storage.
    r_profiles = s.get(
        f"{base}/api/user-profiles?limit=20",
        headers={"Accept": "application/json"},
        timeout=10,
    )
    profiles_data = _safe_json(r_profiles)
    profiles = profiles_data.get("items") if isinstance(profiles_data, dict) else None
    picked_emp_no = None
    if isinstance(profiles, list) and profiles:
        for p in profiles:
            emp = str((p or {}).get("emp_no") or "").strip()
            if emp:
                picked_emp_no = emp
                break
    print("PICKED_OWNER_EMP_NO", picked_emp_no)
    if picked_emp_no:
        owner_payload = {
            "asset_category": "SAN",
            "asset_type": "DIRECTOR",
            "system_owner": picked_emp_no,
            "service_owner": picked_emp_no,
        }
        r_owner = s.put(url_put, json=owner_payload, headers={"Accept": "application/json"}, timeout=10)
        print("PUT(owner)", url_put, "->", r_owner.status_code)
        print("OWNER_PUT_BODY_HEAD", _safe_json(r_owner))
        r_get = s.get(url_put, headers={"Accept": "application/json"}, timeout=10)
        got = _safe_json(r_get)
        item = got.get("item") if isinstance(got, dict) else None
        if isinstance(item, dict):
            print(
                "OWNER_GET_VERIFY",
                "system_owner_emp_no=", item.get("system_owner_emp_no"),
                "service_owner_emp_no=", item.get("service_owner_emp_no"),
                "system_owner_name=", item.get("system_owner_name"),
                "service_owner_name=", item.get("service_owner_name"),
            )

    # Negative test: values that used to cause 500 should now be blocked as 400 (FK/NOT NULL/etc)
    bad_payload = {
        "asset_category": "SAN",
        "asset_type": "DIRECTOR",
        "manufacturer_code": "-",
        "server_code": "-",
        "rack_code": "-",
    }
    r_bad = s.put(url_put, json=bad_payload, headers={"Accept": "application/json"}, timeout=10)
    print("PUT(bad)", url_put, "->", r_bad.status_code)
    print("BAD_BODY_HEAD", _safe_json(r_bad))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
