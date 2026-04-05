"""Smoke check for tab07 activate page + hw-activates API.

- Confirms the HTML includes the expected JS cache-bust version.
- Confirms /api/hw-activates supports basic CRUD.

Uses stdlib only (urllib) to avoid extra deps.
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request


BASE = "http://127.0.0.1:8080"


def http_get(path: str) -> tuple[int, str]:
    url = BASE + path
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        return resp.status, body


def http_json(method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    url = BASE + path
    data = None
    headers = {"Accept": "application/json"}

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        try:
            return resp.status, json.loads(body)
        except Exception:
            return resp.status, {"_raw": body}


def main() -> int:
    # 1) Page loads latest JS
    status, html = http_get("/p/hw_server_onpremise_activate")
    if status != 200:
        print(f"[FAIL] GET tab07 page status={status}")
        return 2

    needle = "/static/js/_detail/tab07-activate.js?v=1.3"
    if needle not in html:
        print("[FAIL] tab07 page does not include expected JS version")
        print("       expected:", needle)
        return 3

    print("[OK] tab07 page includes", needle)

    # 2) CRUD on API
    scope_key = "hw_server_onpremise_activate"
    asset_id = 1

    payload = {
        "scope_key": scope_key,
        "asset_id": asset_id,
        "svc_type": "테스트",
        "svc_name": "smoke",
        "account": "root",
        "start": "echo start",
        "stop": "echo stop",
        "check": "echo check",
        "owner": "qa",
    }

    st, created = http_json("POST", "/api/hw-activates", payload)
    if st not in (200, 201) or not isinstance(created, dict) or "id" not in created:
        print(f"[FAIL] POST /api/hw-activates status={st} body={created}")
        return 4

    new_id = created["id"]
    print(f"[OK] POST created id={new_id}")

    qs = urllib.parse.urlencode({"scope_key": scope_key, "asset_id": str(asset_id), "page": "1", "page_size": "10"})
    st, listed = http_json("GET", f"/api/hw-activates?{qs}")
    if st != 200 or "items" not in listed:
        print(f"[FAIL] GET list status={st} body={listed}")
        return 5

    ids = [it.get("id") for it in (listed.get("items") or [])]
    if new_id not in ids:
        print("[FAIL] created id not found in list")
        print("       ids:", ids)
        return 6

    print("[OK] GET list contains created id")

    st, deleted = http_json("DELETE", f"/api/hw-activates/{new_id}")
    if st != 200 or not (deleted.get("ok") is True or deleted.get("_raw")):
        print(f"[FAIL] DELETE status={st} body={deleted}")
        return 7

    print("[OK] DELETE")
    print("[DONE] tab07 activate + hw-activates basic CRUD looks good")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
