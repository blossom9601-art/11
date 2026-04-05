import os
import time
from typing import Any, Dict

import requests


def _safe_headers(headers: Any) -> dict:
    out = {}
    for k in ["Set-Cookie", "Location", "Content-Type"]:
        v = headers.get(k)
        if v:
            out[k] = v
    return out


def _require(status_code: int, *, expected: int, body: str) -> None:
    if status_code != expected:
        raise RuntimeError(f"HTTP {status_code} (expected {expected}): {body[:500]}")


def main() -> int:
    base = os.environ.get("BLOSSOM_BASE", "http://127.0.0.1:8080").rstrip("/")
    emp_no = os.environ.get("BLOSSOM_EMP_NO", "ADMIN")
    password = os.environ.get("BLOSSOM_PASSWORD", "Passw0rd")

    s = requests.Session()

    r0 = s.get(f"{base}/login", allow_redirects=True, timeout=10)
    print("GET /login", r0.status_code, "final_url", r0.url)

    r = s.post(
        f"{base}/login",
        data={"employee_id": emp_no, "password": password},
        allow_redirects=True,
        timeout=10,
    )
    print("POST /login final", r.status_code, "final_url", r.url)
    print("final_headers", _safe_headers(r.headers))
    print("cookies", s.cookies.get_dict())

    probe = s.get(f"{base}/api/prj/projects?page=1&page_size=1", timeout=10)
    print("probe /api/prj/projects", probe.status_code, "headers", _safe_headers(probe.headers))
    _require(probe.status_code, expected=200, body=probe.text)

    suffix = int(time.time())
    payload_owned: Dict[str, Any] = {
        "project_name": f"SMOKE Tab80 Stakeholder {suffix}",
        "project_type": "SW",
        "status": "ACTIVE",
    }

    owner_dept_id = os.environ.get("BLOSSOM_OWNER_DEPT_ID")
    manager_user_id = os.environ.get("BLOSSOM_MANAGER_USER_ID")
    if owner_dept_id:
        payload_owned["owner_dept_id"] = int(owner_dept_id)
    if manager_user_id:
        payload_owned["manager_user_id"] = int(manager_user_id)

    res_create = s.post(f"{base}/api/prj/projects", json=payload_owned, timeout=10)
    print("POST /api/prj/projects", res_create.status_code)
    _require(res_create.status_code, expected=201, body=res_create.text)
    project_id = res_create.json()["item"]["id"]
    print("created project_id", project_id)

    # Tab80 payload (rows are stored inside payload.stakeholder.rows)
    rows_v1 = [
        {
            "org": "SMOKE-ORG",
            "dept": "SMOKE-DEPT",
            "name": "홍길동",
            "position": "대리",
            "role": "Stakeholder",
            "involve": "I",
            "remark": "created by scripts/_smoke_check_tab80_stakeholder_http.py",
        }
    ]

    res_post = s.post(
        f"{base}/api/prj/projects/{project_id}/tabs/stakeholder",
        json={"payload": {"stakeholder": {"rows": rows_v1}}},
        timeout=10,
    )
    print("POST /api/prj/projects/{id}/tabs/stakeholder", res_post.status_code)
    _require(res_post.status_code, expected=201, body=res_post.text)
    item_id = res_post.json().get("item", {}).get("id")
    if not item_id:
        raise RuntimeError("POST tab80 did not return item.id")

    res_list = s.get(f"{base}/api/prj/projects/{project_id}/tabs/stakeholder", timeout=10)
    print("GET /api/prj/projects/{id}/tabs/stakeholder", res_list.status_code)
    _require(res_list.status_code, expected=200, body=res_list.text)

    data = res_list.json()
    total = data.get("total")
    items = data.get("items") or []
    print("total", total)

    if total != 1 or not items:
        raise RuntimeError(f"Unexpected list response: total={total} items_len={len(items)}")

    got_rows = (((items[0] or {}).get("payload") or {}).get("stakeholder") or {}).get("rows")
    if not isinstance(got_rows, list) or not got_rows:
        raise RuntimeError(f"Unexpected payload.stakeholder.rows: {got_rows!r}")
    if got_rows[0].get("org") != "SMOKE-ORG":
        raise RuntimeError(f"Unexpected stakeholder.rows[0].org: {got_rows[0].get('org')!r}")

    # Update (PUT) and verify roundtrip
    rows_v2 = [
        {
            "org": "SMOKE-ORG-UPDATED",
            "dept": "SMOKE-DEPT",
            "name": "홍길동",
            "position": "대리",
            "role": "Stakeholder",
            "involve": "I",
            "remark": "updated by scripts/_smoke_check_tab80_stakeholder_http.py",
        }
    ]

    res_put = s.put(
        f"{base}/api/prj/projects/{project_id}/tabs/stakeholder/{item_id}",
        json={"payload": {"stakeholder": {"rows": rows_v2}}},
        timeout=10,
    )
    print("PUT /api/prj/projects/{id}/tabs/stakeholder/{item_id}", res_put.status_code)
    _require(res_put.status_code, expected=200, body=res_put.text)

    res_list2 = s.get(f"{base}/api/prj/projects/{project_id}/tabs/stakeholder", timeout=10)
    print("GET /api/prj/projects/{id}/tabs/stakeholder (after PUT)", res_list2.status_code)
    _require(res_list2.status_code, expected=200, body=res_list2.text)

    items2 = (res_list2.json() or {}).get("items") or []
    got_rows2 = (((items2[-1] or {}).get("payload") or {}).get("stakeholder") or {}).get("rows")
    if not isinstance(got_rows2, list) or not got_rows2:
        raise RuntimeError(f"Unexpected payload.stakeholder.rows after PUT: {got_rows2!r}")
    if got_rows2[0].get("org") != "SMOKE-ORG-UPDATED":
        raise RuntimeError(f"Unexpected updated stakeholder.rows[0].org: {got_rows2[0].get('org')!r}")

    print("OK: stakeholder(tab80) payload roundtrip verified (POST/GET/PUT)")

    try:
        res_del = s.delete(f"{base}/api/prj/projects/{project_id}", timeout=10)
        print("DELETE /api/prj/projects/{id}", res_del.status_code)
    except Exception as e:
        print("WARN: cleanup failed", repr(e))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
