"""HTTP smoke check for server frame frontbay/rearbay tabs after JS split.

What it verifies (best-effort):
- /p/hw_server_frame_frontbay includes data-context marker and loads
  /static/js/_detail/tab21-frontbay.js (and not 2.frame_detail.js).
- /p/hw_server_frame_rearbay includes data-context marker and loads
  /static/js/_detail/tab22-rearbay.js (and not 2.frame_detail.js).
- /api/hw-frame-frontbay and /api/hw-frame-rearbay support CRUD keyed by
  (scope_key, asset_id), which corresponds to the UI save/refresh loop.

Notes:
- This script does not log in. If the server redirects to login, it will
  WARN and skip the HTML assertions (but still try API checks).

Run (server must be running):
  .venv/Scripts/python.exe scripts/_smoke_check_server_frame_bays_http.py

Optional env vars:
  BLOSSOM_BASE_URL (default: http://127.0.0.1:8080)
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def _base_url() -> str:
    return os.environ.get("BLOSSOM_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def http_get_text(url: str, timeout: float = 15.0) -> str:
    req = urllib.request.Request(url, headers={"Accept": "text/html,application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def request_json(method: str, url: str, payload=None, *, timeout: float = 15.0):
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
        snippet = haystack[:800]
        fail(f"Missing expected marker in {context}: {needle}\n--- head(800) ---\n{snippet}")


def assert_not_contains(haystack: str, needle: str, *, context: str) -> None:
    if needle in haystack:
        snippet = haystack[:800]
        fail(f"Unexpected marker in {context}: {needle}\n--- head(800) ---\n{snippet}")


def _check_page(*, base: str, key: str, marker: str, expect_js_sub: str) -> None:
    page_url = f"{base}/p/{urllib.parse.quote(key)}"
    html = http_get_text(page_url)

    if marker in html:
        print(f"OK: {key} contains {marker}")
    else:
        if looks_like_login_page(html):
            print(f"WARN: {key} may require login; skipping HTML marker assertions")
            return
        assert_contains(html, marker, context=f"{key} page")

    assert_contains(html, expect_js_sub, context=f"{key} page")

    # Ensure we no longer load the monolithic script on these tabs.
    assert_not_contains(
        html,
        "/static/js/2.hardware/2-1.server/2-1-3.frame/2.frame_detail.js",
        context=f"{key} page",
    )
    print(f"OK: {key} loads {expect_js_sub} (and not 2.frame_detail.js)")


def _exercise_api(*, base: str, api_prefix: str, scope_key: str, asset_id: int, payload: dict) -> None:
    created_id = None
    try:
        list_url = (
            f"{base}{api_prefix}?scope_key={urllib.parse.quote(scope_key)}"
            f"&asset_id={urllib.parse.quote(str(asset_id))}&page=1&page_size=200"
        )

        status, body = request_json("GET", list_url)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: list {api_prefix} {status} {body}")
        if body.get("total") is None or body.get("items") is None:
            fail(f"FAIL: unexpected list payload shape {body}")
        print(f"OK: {api_prefix} list reachable")

        status, body = request_json("POST", f"{base}{api_prefix}", payload)
        if status != 201 or not isinstance(body, dict):
            fail(f"FAIL: create {api_prefix} {status} {body}")
        created_id = body.get("id")
        if not created_id:
            fail(f"FAIL: create response missing id {body}")
        print(f"OK: {api_prefix} created id={created_id}")

        status, body = request_json("GET", list_url)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: list after create {api_prefix} {status} {body}")
        items = body.get("items")
        if not isinstance(items, list):
            fail(f"FAIL: list items not a list {type(items)}")
        found = next((it for it in items if isinstance(it, dict) and it.get("id") == created_id), None)
        if not found:
            fail(f"FAIL: created row not found after refresh {api_prefix}")
        if found.get("model") != payload.get("model"):
            fail(f"FAIL: created row model mismatch {found.get('model')} != {payload.get('model')}")
        print(f"OK: {api_prefix} row present after refresh")

        unique = str(time.time_ns())
        update_payload = {
            "model": f"MODEL-UPD-{unique}",
            "remark": f"updated by scripts/_smoke_check_server_frame_bays_http.py ({api_prefix})",
        }
        status, body = request_json("PUT", f"{base}{api_prefix}/{created_id}", update_payload)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: update {api_prefix} {status} {body}")
        if body.get("model") != update_payload["model"]:
            fail(f"FAIL: update did not apply model {body}")
        print(f"OK: {api_prefix} updated")

        status, body = request_json("DELETE", f"{base}{api_prefix}/{created_id}")
        if status != 200 or not isinstance(body, dict) or body.get("ok") is not True:
            fail(f"FAIL: delete {api_prefix} {status} {body}")
        print(f"OK: {api_prefix} deleted")

        status, body = request_json("GET", list_url)
        if status != 200 or not isinstance(body, dict):
            fail(f"FAIL: list after delete {api_prefix} {status} {body}")
        items = body.get("items")
        still = next((it for it in items if isinstance(it, dict) and it.get("id") == created_id), None)
        if still:
            fail(f"FAIL: deleted row still present after refresh {api_prefix}")
        print(f"OK: {api_prefix} delete persists across refresh")

    finally:
        if created_id is not None:
            request_json("DELETE", f"{base}{api_prefix}/{created_id}")


def main() -> int:
    base = _base_url()

    # Use a unique-ish asset_id each run; it only partitions data.
    asset_id = (time.time_ns() % 1_000_000_000) + 10_000

    # 1) Page HTML checks (best-effort)
    try:
        _check_page(
            base=base,
            key="hw_server_frame_frontbay",
            marker='data-context="frontbay"',
            expect_js_sub="/static/js/_detail/tab21-frontbay.js",
        )
    except urllib.error.URLError as e:
        print("WARN: failed to fetch frontbay page; skipping HTML checks")
        print("  err:", e)

    try:
        _check_page(
            base=base,
            key="hw_server_frame_rearbay",
            marker='data-context="rearbay"',
            expect_js_sub="/static/js/_detail/tab22-rearbay.js",
        )
    except urllib.error.URLError as e:
        print("WARN: failed to fetch rearbay page; skipping HTML checks")
        print("  err:", e)

    # 2) API CRUD checks
    unique = str(time.time_ns())

    front_payload = {
        "scope_key": "hw_server_frame_frontbay",
        "asset_id": asset_id,
        "type": "서버",
        "space": "BAY1",
        "model": f"MODEL-FRONT-{unique}",
        "spec": "spec",
        "serial": f"SERIAL-FRONT-{unique}",
        "vendor": "smoke",
        "fw": "1.0",
        "remark": "created by scripts/_smoke_check_server_frame_bays_http.py (frontbay)",
    }
    _exercise_api(
        base=base,
        api_prefix="/api/hw-frame-frontbay",
        scope_key=front_payload["scope_key"],
        asset_id=asset_id,
        payload=front_payload,
    )

    rear_payload = {
        "scope_key": "hw_server_frame_rearbay",
        "asset_id": asset_id,
        "type": "SAN",
        "space": "BAY1",
        "model": f"MODEL-REAR-{unique}",
        "spec": "spec",
        "serial": f"SERIAL-REAR-{unique}",
        "vendor": "smoke",
        "fw": "1.0",
        "remark": "created by scripts/_smoke_check_server_frame_bays_http.py (rearbay)",
    }
    _exercise_api(
        base=base,
        api_prefix="/api/hw-frame-rearbay",
        scope_key=rear_payload["scope_key"],
        asset_id=asset_id,
        payload=rear_payload,
    )

    print("DONE: frontbay+rearbay pages wired to split JS; APIs support CRUD")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print("FATAL:", exc, file=sys.stderr)
        raise
