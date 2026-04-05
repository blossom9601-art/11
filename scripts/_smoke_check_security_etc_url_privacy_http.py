"""HTTP smoke check for Security ETC (기타보안장비) URL privacy.

Goal
- Ensure the ETC list page does NOT embed navigation that appends `asset_id` to the URL.
- Ensure the ETC detail JS includes early "persist then strip" behavior:
  store selected asset_id, then remove it from location via history.replaceState.

This is a lightweight check (HTML + static JS fetch). It does not execute JS.

Run:
  .venv/Scripts/python.exe scripts/_smoke_check_security_etc_url_privacy_http.py

Env:
  BLOSSOM_BASE (default: http://127.0.0.1:8080)
"""

from __future__ import annotations

import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def http_get_text(url: str, timeout: float = 15.0) -> str:
    req = urllib.request.Request(url, headers={"Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def fail(msg: str) -> None:
    raise SystemExit(msg)


def assert_contains(haystack: str, needle: str, *, context: str) -> None:
    if needle not in haystack:
        snippet = haystack[:600]
        fail(f"Missing expected marker in {context}: {needle}\n--- head(600) ---\n{snippet}")


def assert_not_contains(haystack: str, needle: str, *, context: str) -> None:
    if needle in haystack:
        i = haystack.find(needle)
        snippet = haystack[max(0, i - 120) : i + 240]
        fail(f"Unexpected marker present in {context}: {needle}\n--- context ---\n{snippet}")


def main(argv: list[str]) -> int:
    quiet = "--quiet" in argv

    base = os.environ.get("BLOSSOM_BASE", "http://127.0.0.1:8080").rstrip("/")

    # Pages
    list_key = "hw_security_etc"
    detail_key = "hw_security_etc_detail"

    list_page_url = f"{base}/p/{urllib.parse.quote(list_key)}"
    detail_page_url = f"{base}/p/{urllib.parse.quote(detail_key)}"

    # Expected script includes (cache-bust)
    expected_list_script = "/static/js/2.hardware/2-5.security/2-5-8.etc/1.etc_list.js?v=1.2.23"
    expected_detail_script = "/static/js/2.hardware/2-5.security/2-5-8.etc/2.etc_detail.js?v=1.2.4"

    # Fetch pages
    try:
        html_list = http_get_text(list_page_url)
    except urllib.error.URLError as e:
        fail(f"Failed to fetch list page: {list_page_url}\n{e}")

    try:
        html_detail = http_get_text(detail_page_url)
    except urllib.error.URLError as e:
        fail(f"Failed to fetch detail page: {detail_page_url}\n{e}")

    assert_contains(html_list, expected_list_script, context="ETC list HTML")
    assert_contains(html_detail, expected_detail_script, context="ETC detail HTML")

    # Fetch static JS
    list_js_url = f"{base}{expected_list_script}"
    detail_js_url = f"{base}{expected_detail_script}"

    try:
        js_list = http_get_text(list_js_url)
    except urllib.error.URLError as e:
        fail(f"Failed to fetch list JS: {list_js_url}\n{e}")

    try:
        js_detail = http_get_text(detail_js_url)
    except urllib.error.URLError as e:
        fail(f"Failed to fetch detail JS: {detail_js_url}\n{e}")

    # List JS should not append asset_id into the detail URL
    assert_not_contains(js_list, "Preserve asset_id in query", context="ETC list JS")
    assert_not_contains(js_list, ".searchParams.set('asset_id'", context="ETC list JS")
    assert_not_contains(js_list, '.searchParams.set("asset_id"', context="ETC list JS")

    # Detail JS should persist + strip asset_id early
    assert_contains(js_detail, "history.replaceState", context="ETC detail JS")
    assert_contains(js_detail, "security-etc:selected:asset_id", context="ETC detail JS")
    assert_contains(js_detail, ".delete('asset_id')", context="ETC detail JS")

    # Sanity: store happens before strip in the source (best-effort index check)
    idx_store = js_detail.find("security-etc:selected:asset_id")
    idx_strip = js_detail.find("history.replaceState")
    if idx_store != -1 and idx_strip != -1 and idx_store > idx_strip:
        fail("ETC detail JS: expected storage write to appear before history.replaceState")

    if not quiet:
        print("OK: ETC list/detail pages reference latest JS")
        print("OK: ETC list JS does not append asset_id to URL")
        print("OK: ETC detail JS contains early persist+strip logic")
        print("base:", base)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except SystemExit:
        raise
    except Exception as exc:
        print("FATAL:", exc, file=sys.stderr)
        raise
