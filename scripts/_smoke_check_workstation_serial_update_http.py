import json
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


def main() -> int:
    checks = []  # (label, passed, detail)

    def ok(label: str, detail: str = ""):
        checks.append((label, True, detail))

    def bad(label: str, detail: str = ""):
        checks.append((label, False, detail))

    created_id = None
    bulk_delete_api = "/api/hardware/workstation/assets/bulk-delete"
    ok_all = True
    unique = str(time.time_ns())

    try:
        # Create
        create_payload = {
            "asset_code": f"SMOKE-WORKSTATION-SERIAL-{unique}",
            "asset_name": "SMOKE workstation serial update",
        }
        st, body = _request_json("POST", "/api/hardware/workstation/assets", create_payload)
        if st != 201 or not isinstance(body, dict) or body.get("success") is not True:
            bad("POST /api/hardware/workstation/assets", f"status={st} body={body}")
            ok_all = False
        else:
            item = body.get("item") or {}
            created_id = item.get("id")
            if not isinstance(created_id, int):
                bad("POST /api/hardware/workstation/assets", f"missing item.id keys={list(item.keys())}")
                ok_all = False
            else:
                ok("POST /api/hardware/workstation/assets", f"id={created_id}")

        # Update
        new_serial = f"SERIAL-{unique}"
        if ok_all and isinstance(created_id, int):
            st, body = _request_json("PUT", f"/api/hardware/workstation/assets/{created_id}", {"serial_number": new_serial})
            if st != 200 or not isinstance(body, dict) or body.get("success") is not True:
                bad("PUT workstation asset serial_number", f"status={st} body={body}")
                ok_all = False
            else:
                ok("PUT workstation asset serial_number", new_serial)

        # Verify
        if ok_all and isinstance(created_id, int):
            st, body = _request_json("GET", f"/api/hardware/workstation/assets/{created_id}")
            if st != 200 or not isinstance(body, dict) or body.get("success") is not True:
                bad("GET workstation asset (after PUT)", f"status={st} body={body}")
                ok_all = False
            else:
                item = body.get("item") or {}
                got = item.get("serial_number") or ""
                if got != new_serial:
                    bad("verify serial_number", f"expected={new_serial} got={got} item_keys={list(item.keys())}")
                    ok_all = False
                else:
                    ok("verify serial_number", got)
    finally:
        if isinstance(created_id, int):
            _request_json("POST", bulk_delete_api, {"ids": [created_id]})

    for label, passed, detail in checks:
        mark = "OK" if passed else "FAIL"
        print(f"[{mark}] {label}" + (f" :: {detail}" if detail else ""))

    ok_all = ok_all and all(passed for _, passed, _ in checks)
    return 0 if ok_all else 2


if __name__ == "__main__":
    raise SystemExit(main())
