import json
import os
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"


def _request(method: str, path: str, *, payload=None, accept: str = "application/json"):
    url = BASE + path
    data = None
    headers = {"Accept": accept}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()
            return resp.status, resp.headers.get("Content-Type", ""), body
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, e.headers.get("Content-Type", ""), body


def _request_json(method: str, path: str, payload=None):
    status, ctype, body = _request(method, path, payload=payload, accept="application/json")
    text = body.decode("utf-8", errors="replace")
    try:
        data = json.loads(text) if text else None
    except json.JSONDecodeError:
        data = {"_raw": text, "_content_type": ctype}
    return status, data


def _request_html(path: str):
    status, ctype, body = _request("GET", path, accept="text/html")
    text = body.decode("utf-8", errors="replace")
    return status, ctype, text


def main() -> int:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    log_path = os.path.join(repo_root, "smoke_hw_server_tab02_software_pages_http_latest.txt")

    checks: list[tuple[str, bool, str]] = []

    def ok(label: str, detail: str = ""):
        checks.append((label, True, detail))

    def bad(label: str, detail: str = ""):
        checks.append((label, False, detail))

    # category_slug -> (create_api_prefix, bulk_delete_prefix, page_key, expected_js_substring)
    targets = {
        "onpremise": (
            "/api/hardware/onpremise/assets",
            "/api/hardware/onpremise/assets/bulk-delete",
            "hw_server_onpremise_sw",
            "/static/js/2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.js",
        ),
        "cloud": (
            "/api/hardware/cloud/assets",
            "/api/hardware/cloud/assets/bulk-delete",
            "hw_server_cloud_sw",
            "/static/js/2.hardware/2-1.server/2-1-2.cloud/2.cloud_detail.js",
        ),
        "workstation": (
            "/api/hardware/workstation/assets",
            "/api/hardware/workstation/assets/bulk-delete",
            "hw_server_workstation_sw",
            "/static/js/2.hardware/2-1.server/2-1-4.workstation/2.workstation_detail.js",
        ),
    }

    created_ids: list[tuple[str, int]] = []  # (bulk_delete_path, asset_id)

    def exercise_one(kind: str) -> bool:
        create_api, bulk_delete_api, page_key, js_sub = targets[kind]

        unique = str(time.time_ns())
        payload = {"asset_code": f"SMOKE-{kind.upper()}-{unique}", "asset_name": f"SMOKE {kind} server"}

        st, body = _request_json("POST", create_api, payload)
        if st != 201 or not isinstance(body, dict) or body.get("success") is not True:
            bad(f"POST {create_api}", f"status={st} body={body}")
            return False

        item = (body.get("item") or {}) if isinstance(body, dict) else {}
        asset_id = item.get("id")
        if not isinstance(asset_id, int):
            bad(f"POST {create_api}", f"missing item.id keys={list(item.keys())}")
            return False

        created_ids.append((bulk_delete_api, asset_id))
        ok(f"POST {create_api}", f"id={asset_id}")

        # Fetch the tab02-software HTML (what user opens in browser)
        st, ctype, html = _request_html(f"/p/{page_key}?id={asset_id}")
        if st != 200:
            bad(f"GET /p/{page_key}?id={asset_id}", f"status={st} content-type={ctype}")
            return False
        if "id=\"sw-spec-table\"" not in html and "id='sw-spec-table'" not in html:
            bad(f"GET /p/{page_key}", "missing sw-spec-table")
            return False
        if js_sub not in html:
            bad(f"GET /p/{page_key}", f"missing expected JS src contains {js_sub}")
            return False
        ok(f"GET /p/{page_key}")

        # Now mimic the JS calls
        sw_base = f"/api/hardware/assets/{asset_id}/software"

        st, body = _request_json("GET", sw_base)
        if st != 200 or not isinstance(body, dict) or body.get("success") is not True:
            bad(f"GET {sw_base}", f"status={st} body={body}")
            return False
        ok(f"GET {sw_base}", f"total={body.get('total')}")

        sw_payload = {
            "type": "운영체제",
            "name": f"SMOKE-{kind}-OS",
            "version": "1.0",
            "vendor": "SMOKE",
            "qty": 1,
            "license_key": "SMOKE-LIC",
            "remark": "created by smoke",
        }
        st, body = _request_json("POST", sw_base, sw_payload)
        if st != 201 or not isinstance(body, dict) or body.get("success") is not True:
            bad(f"POST {sw_base}", f"status={st} body={body}")
            return False
        sw_id = ((body.get("item") or {}) if isinstance(body, dict) else {}).get("id")
        if not isinstance(sw_id, int):
            bad(f"POST {sw_base}", f"missing item.id body={body}")
            return False
        ok(f"POST {sw_base}", f"sw_id={sw_id}")

        st, body = _request_json("PUT", f"{sw_base}/{sw_id}", {"qty": 2, "remark": "updated"})
        if st != 200 or not isinstance(body, dict) or body.get("success") is not True:
            bad(f"PUT {sw_base}/{sw_id}", f"status={st} body={body}")
            return False
        ok(f"PUT {sw_base}/{sw_id}")

        st, body = _request_json("DELETE", f"{sw_base}/{sw_id}")
        if st != 200 or not isinstance(body, dict) or body.get("success") is not True:
            bad(f"DELETE {sw_base}/{sw_id}", f"status={st} body={body}")
            return False
        ok(f"DELETE {sw_base}/{sw_id}")

        st, body = _request_json("GET", sw_base)
        if st != 200 or not isinstance(body, dict) or body.get("success") is not True:
            bad(f"GET {sw_base} (after delete)", f"status={st} body={body}")
            return False
        ok(f"GET {sw_base} (after delete)", f"total={body.get('total')}")
        return True

    ok_all = True
    try:
        for kind in ("onpremise", "cloud", "workstation"):
            ok_all = exercise_one(kind) and ok_all
    finally:
        # Best-effort cleanup
        for bulk_delete_api, asset_id in created_ids:
            _request_json("POST", bulk_delete_api, {"ids": [asset_id]})

    lines = []
    for label, passed, detail in checks:
        mark = "OK" if passed else "FAIL"
        lines.append(f"[{mark}] {label}" + (f" :: {detail}" if detail else ""))

    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    tail = "\n".join(lines[-25:])
    print(tail)

    return 0 if ok_all else 2


if __name__ == "__main__":
    raise SystemExit(main())
