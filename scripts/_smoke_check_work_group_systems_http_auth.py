import argparse
import json
import os
import time

import requests


def _http_json(session: requests.Session, method: str, url: str, payload=None):
    headers = {"Accept": "application/json"}
    try:
        resp = session.request(method, url, json=payload, headers=headers, timeout=10)
    except requests.RequestException as e:
        raise RuntimeError(f"HTTP request failed method={method} url={url} error={e}") from e

    ctype = resp.headers.get("Content-Type", "")
    if "application/json" in ctype:
        try:
            return resp.status_code, resp.json()
        except Exception:
            return resp.status_code, {"_raw": resp.text}
    return resp.status_code, resp.text


def _resolve_work_group_id(session: requests.Session, base: str) -> int:
    status, wg = _http_json(session, "GET", f"{base}/api/work-groups?page=1&page_size=1")
    if status != 200:
        raise RuntimeError(f"GET /api/work-groups failed status={status} body={wg}")

    gid = None
    if isinstance(wg, dict) and wg.get("items"):
        gid = (wg["items"][0] or {}).get("id")
    elif isinstance(wg, dict) and wg.get("data"):
        gid = (wg["data"][0] or {}).get("id")
    elif isinstance(wg, dict):
        gid = wg.get("id")

    if not gid:
        raise RuntimeError("Could not resolve work_group_id from /api/work-groups response")
    return int(gid)


def _login(session: requests.Session, base: str, emp_no: str, password: str) -> None:
    # Server expects form fields: employee_id, password
    try:
        # Warm up any app/session machinery (not strictly required, but harmless)
        session.get(f"{base}/login", timeout=10)
        resp = session.post(
            f"{base}/login",
            data={"employee_id": emp_no, "password": password},
            allow_redirects=True,
            timeout=10,
        )
    except requests.RequestException as e:
        raise RuntimeError(f"Login request failed: {e}") from e

    if resp.status_code >= 400:
        raise RuntimeError(f"Login failed HTTP {resp.status_code} body_head={resp.text[:200]}")


def _cookie_names(session: requests.Session):
    try:
        return sorted(session.cookies.get_dict().keys())
    except Exception:
        return []


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke check: work-group systems CRUD via live HTTP (optional login)")
    parser.add_argument("--base", default="http://127.0.0.1:8080")
    parser.add_argument("--group-id", type=int, default=0)
    parser.add_argument("--emp-no", default=os.environ.get("BLOSSOM_EMP_NO", ""))
    parser.add_argument("--password", default=os.environ.get("BLOSSOM_PASSWORD", ""))
    args = parser.parse_args()

    session = requests.Session()

    base = args.base.rstrip("/")
    group_id = args.group_id or _resolve_work_group_id(session, base)
    print("RESOLVED work_group_id", group_id)

    # Always verify GET works.
    status, data = _http_json(session, "GET", f"{base}/api/work-groups/{group_id}/systems")
    print("GET /systems status", status)
    if status != 200:
        print("GET /systems body_head", str(data)[:200])
        return 2

    # If no credentials are provided, assert write endpoints are protected (401).
    if not args.emp_no or not args.password:
        status, body = _http_json(
            session,
            "POST",
            f"{base}/api/work-groups/{group_id}/systems",
            {"system_name": "SMOKE-noauth"},
        )
        print("POST /systems (unauth) status", status)
        if status != 401:
            print("Expected 401 when unauthenticated. body_head=", str(body)[:200])
            return 3
        print("OK: unauth POST is blocked (401).")
        print("To run full CRUD: set BLOSSOM_EMP_NO and BLOSSOM_PASSWORD (or pass --emp-no/--password).")
        return 0

    # Login and do full CRUD.
    _login(session, base, args.emp_no, args.password)

    # Verify that the login actually established a session.
    # We use an API that is known to require login; a 401 here means the cookie was not set/accepted.
    status, probe = _http_json(session, "GET", f"{base}/api/prj/projects?page=1&page_size=1")
    if status == 401:
        print("LOGIN FAILED: session not established (probe /api/prj/projects returned 401)")
        print("cookie_names", _cookie_names(session))
        print("probe.body_head", str(probe)[:200])
        return 10

    stamp = int(time.time())
    create_payload = {
        "system_name": f"SMOKE-{stamp}",
        "system_ip": "10.0.0.1",
        "mgmt_ip": "10.0.0.2",
        "os_type": "LINUX",
        "os_version": "0",
    }

    status, created = _http_json(session, "POST", f"{base}/api/work-groups/{group_id}/systems", create_payload)
    print("POST /systems status", status)
    if status != 201 or not isinstance(created, dict) or not created.get("success"):
        print("Create failed body_head", str(created)[:200])
        return 4

    item = created.get("item") or {}
    system_id = item.get("id")
    if not system_id:
        print("Create response missing item.id")
        return 5

    status, updated = _http_json(
        session,
        "PUT",
        f"{base}/api/work-groups/{group_id}/systems/{system_id}",
        {"system_name": f"SMOKE-{stamp}-UPDATED"},
    )
    print("PUT /systems/<id> status", status)
    if status != 200 or not isinstance(updated, dict) or not updated.get("success"):
        print("Update failed body_head", str(updated)[:200])
        return 6

    status, deleted = _http_json(session, "DELETE", f"{base}/api/work-groups/{group_id}/systems/{system_id}")
    print("DELETE /systems/<id> status", status)
    if status != 200 or not isinstance(deleted, dict) or not deleted.get("success"):
        print("Delete failed body_head", str(deleted)[:200])
        return 7

    status, after = _http_json(session, "GET", f"{base}/api/work-groups/{group_id}/systems")
    if status != 200 or not isinstance(after, dict):
        print("Post-delete GET failed body_head", str(after)[:200])
        return 8

    items = after.get("items") or []
    if any((row or {}).get("id") == system_id for row in items):
        print("Expected deleted item to be absent from list.")
        return 9

    print("OK: create/update/delete roundtrip completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
