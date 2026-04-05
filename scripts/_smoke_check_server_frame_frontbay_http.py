"""HTTP smoke check for server frame frontbay (tab21) persistence.

This verifies (best-effort):
- The /p/hw_server_frame_frontbay page contains the frontbay table marker.
- The frontbay persistence API /api/hw-frame-frontbay supports CRUD keyed by
  (scope_key, asset_id), which corresponds to a "save -> refresh -> restore"
  loop in the UI.

Run (server must be running on 127.0.0.1:8080):
  .venv/Scripts/python.exe scripts/_smoke_check_server_frame_frontbay_http.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8080"


def http_get_text(url: str, timeout: float = 15.0) -> str:
    req = urllib.request.Request(url, headers={"Accept": "text/html,application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def request_json(method: str, path: str, payload=None, *, timeout: float = 15.0):
    url = BASE + path
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw) if raw else None
        except Exception:
            body = {"_raw": raw}
        return e.code, body


def looks_like_login_page(html: str) -> bool:
    needles = ["login", "로그인", "Sign in", "Unauthorized", "권한", "error", "오류"]
    lowered = html.lower()
    return any(n.lower() in lowered for n in needles)


def fail(msg: str) -> None:
    raise SystemExit(msg)


def assert_contains(haystack: str, needle: str, *, context: str) -> None:
    if needle not in haystack:
        snippet = haystack[:600]
        fail(f"Missing expected marker in {context}: {needle}\n--- head(600) ---\n{snippet}")


def main() -> int:
    scope_key = "hw_server_frame_frontbay"
    # Any integer is OK for this API; it is used to partition data.
    asset_id = (time.time_ns() % 1_000_000_000) + 10_000

    created_id = None
    try:
        # 1) Best-effort: verify the page contains the frontbay marker.
        page_url = f"{BASE}/p/{urllib.parse.quote(scope_key)}"
        try:
            html = http_get_text(page_url)
            if 'data-context="frontbay"' in html:
                print("OK: frontbay page contains data-context marker")
            else:
                if looks_like_login_page(html):
                    print("WARN: frontbay page may require login; skipping HTML marker assertion")
                else:
                    assert_contains(html, 'data-context="frontbay"', context="frontbay page")
        except urllib.error.URLError as e:
            print("WARN: failed to fetch frontbay page; continuing with API checks")
            print("  url:", page_url)
            print("  err:", e)

        # 2) Verify list is reachable
        list_path = (
            "/api/hw-frame-frontbay?scope_key="
            + urllib.parse.quote(scope_key)
            + "&asset_id="
            + urllib.parse.quote(str(asset_id))
            + "&page=1&page_size=200"
        )
        status, body = request_json("GET", list_path)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: list frontbay rows {status} {body}")
        if body.get("total") is None or body.get("items") is None:
            fail(f"FAIL: unexpected list payload shape {body}")
        print("OK: frontbay API list reachable")

        # 3) Create row (simulate save)
        unique = str(time.time_ns())
        create_payload = {
            "scope_key": scope_key,
            "asset_id": asset_id,
            "type": "SMOKE",
            "space": "1U",
            "model": f"MODEL-{unique}",
            "spec": "spec",
            "serial": f"SERIAL-{unique}",
            "vendor": "smoke",
            "fw": "1.0",
            "remark": "created by scripts/_smoke_check_server_frame_frontbay_http.py",
        }
        status, body = request_json("POST", "/api/hw-frame-frontbay", create_payload)
        if status != 201 or not isinstance(body, dict):
            fail(f"FAIL: create frontbay row {status} {body}")
        created_id = body.get("id")
        if not created_id:
            fail(f"FAIL: create response missing id {body}")
        print("OK: frontbay row created id=", created_id)

        # 4) Refresh (list again) and ensure row is present
        status, body = request_json("GET", list_path)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: list after create {status} {body}")
        items = body.get("items")
        if not isinstance(items, list):
            fail(f"FAIL: list items not a list {type(items)}")
        found = next((it for it in items if isinstance(it, dict) and it.get("id") == created_id), None)
        if not found:
            fail("FAIL: created row not found after refresh")
        if found.get("model") != create_payload["model"]:
            fail(f"FAIL: created row model mismatch {found.get('model')} != {create_payload['model']}")
        print("OK: frontbay row present after refresh")

        # 5) Update (simulate edit+save)
        update_payload = {
            "model": f"MODEL-UPD-{unique}",
            "remark": "updated by scripts/_smoke_check_server_frame_frontbay_http.py",
        }
        status, body = request_json("PUT", f"/api/hw-frame-frontbay/{created_id}", update_payload)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: update frontbay row {status} {body}")
        if body.get("model") != update_payload["model"]:
            fail(f"FAIL: update did not apply model {body}")
        print("OK: frontbay row updated")

        # 6) Refresh again and confirm update
        status, body = request_json("GET", list_path)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: list after update {status} {body}")
        items = body.get("items")
        found = next((it for it in items if isinstance(it, dict) and it.get("id") == created_id), None)
        if not found:
            fail("FAIL: updated row not found after refresh")
        if found.get("model") != update_payload["model"]:
            fail(f"FAIL: refreshed row model mismatch {found.get('model')} != {update_payload['model']}")
        print("OK: frontbay row persists across refresh after update")

        # 7) Delete (simulate delete)
        status, body = request_json("DELETE", f"/api/hw-frame-frontbay/{created_id}")
        if status != 200 or not isinstance(body, dict) or body.get("ok") is not True:
            fail(f"FAIL: delete frontbay row {status} {body}")
        print("OK: frontbay row deleted")

        # 8) Refresh and confirm row is gone
        status, body = request_json("GET", list_path)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: list after delete {status} {body}")
        items = body.get("items")
        still = next((it for it in items if isinstance(it, dict) and it.get("id") == created_id), None)
        if still:
            fail("FAIL: deleted row still present after refresh")
        print("OK: delete persists across refresh")

        print("DONE: frontbay save/refresh/restore behavior verified via API")
        return 0
    finally:
        if created_id is not None:
            request_json("DELETE", f"/api/hw-frame-frontbay/{created_id}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print("FATAL:", exc, file=sys.stderr)
        raise
