import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8080"


def http_get(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, r.read().decode("utf-8", "replace")


def http_json(method: str, url: str, payload: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(body) if body else {"error": "HTTPError"}
        except Exception:
            parsed = {"error": body}
        return e.code, parsed


def assert_contains(haystack: str, needle: str, label: str) -> None:
    if needle not in haystack:
        raise AssertionError(f"missing {label}: {needle}")


def check_page(key: str) -> None:
    url = f"{BASE}/p/{urllib.parse.quote(key)}"
    status, html = http_get(url)
    if status != 200:
        raise AssertionError(f"page status {status} for {url}")
    assert_contains(html, 'id="lg-spec-table"', "lg-spec-table")
    if "static/js/blossom.js" not in html:
        # some pages may version the asset, so allow blossom.js?...
        if "blossom.js" not in html:
            raise AssertionError("missing blossom.js")


def roundtrip_api(entity_key: str) -> None:
    payload = {
        "entity_key": entity_key,
        "when": "2026-01-04 16:10",
        "type": "E2E",
        "owner": "smoke",
        "tab": "tab14",
        "summary": "smoke-check",
        "detail": "created via _smoke_check_tab14_logs_http.py",
    }

    st, created = http_json("POST", f"{BASE}/api/change-logs", payload)
    if st != 201:
        raise AssertionError(f"POST failed: status={st} body={created}")
    created_id = created.get("id")
    if not created_id:
        raise AssertionError(f"POST missing id: {created}")

    q = urllib.parse.urlencode({"entity_key": entity_key, "page": 1, "page_size": 100})
    st, listed = http_json("GET", f"{BASE}/api/change-logs?{q}")
    if st != 200:
        raise AssertionError(f"GET list failed: status={st} body={listed}")
    items = listed.get("items") or []
    if not any((it.get("id") == created_id) for it in items if isinstance(it, dict)):
        raise AssertionError(f"created id not found in list: id={created_id} total={listed.get('total')}")

    st, deleted = http_json("DELETE", f"{BASE}/api/change-logs/{int(created_id)}")
    if st != 200 or not deleted.get("ok"):
        raise AssertionError(f"DELETE failed: status={st} body={deleted}")

    st, listed2 = http_json("GET", f"{BASE}/api/change-logs?{q}")
    if st != 200:
        raise AssertionError(f"GET list2 failed: status={st} body={listed2}")
    items2 = listed2.get("items") or []
    if any((it.get("id") == created_id) for it in items2 if isinstance(it, dict)):
        raise AssertionError(f"deleted id still present: id={created_id}")


def main() -> int:
    keys = [
        "hw_server_onpremise_log",
        "hw_network_dedicateline_log",
        "gov_dns_policy_log",
    ]

    failures: list[str] = []

    for key in keys:
        entity_key = f"/p/{key}"
        try:
            check_page(key)
            roundtrip_api(entity_key)
            print(f"OK {key}")
        except Exception as exc:
            failures.append(f"FAIL {key}: {exc}")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
