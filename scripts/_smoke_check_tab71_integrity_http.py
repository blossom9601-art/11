import os
import sys
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

    # 1) Create a project
    suffix = int(time.time())
    payload_owned: Dict[str, Any] = {
        "project_name": f"SMOKE Tab71 Integrity {suffix}",
        "project_type": "SW",
        "status": "ACTIVE",
    }

    # Optional fields (owner_dept_id/manager_user_id) are sometimes required depending on server config.
    # If your server enforces them, set env vars BLOSSOM_OWNER_DEPT_ID / BLOSSOM_MANAGER_USER_ID.
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

    # 2) Save integrity(tab71) payload
    tab_payload: Dict[str, Any] = {
        "requirements": {
            "rows": [
                {
                    "category": "SAMPLE",
                    "type": "FUNC",
                    "uniq_no": f"REQ-{suffix}",
                    "name": "Requirement 1",
                    "definition": "Def",
                    "detail": "Detail",
                    "owner": emp_no,
                }
            ]
        }
    }

    res_post = s.post(
        f"{base}/api/prj/projects/{project_id}/tabs/integrity",
        json={"payload": tab_payload},
        timeout=10,
    )
    print("POST /api/prj/projects/{id}/tabs/integrity", res_post.status_code)
    _require(res_post.status_code, expected=201, body=res_post.text)

    # 3) Reload and verify
    res_list = s.get(f"{base}/api/prj/projects/{project_id}/tabs/integrity", timeout=10)
    print("GET /api/prj/projects/{id}/tabs/integrity", res_list.status_code)
    _require(res_list.status_code, expected=200, body=res_list.text)

    data = res_list.json()
    total = data.get("total")
    items = data.get("items") or []
    print("total", total)

    if total != 1 or not items:
        raise RuntimeError(f"Unexpected list response: total={total} items_len={len(items)}")

    got_uniq = (((items[0] or {}).get("payload") or {}).get("requirements") or {}).get("rows")
    got_uniq = (got_uniq or [{}])[0].get("uniq_no")
    if got_uniq != f"REQ-{suffix}":
        raise RuntimeError(f"Unexpected payload uniq_no: {got_uniq}")

    print("OK: integrity(tab71) payload roundtrip verified")

    # Best-effort cleanup
    try:
        res_del = s.delete(f"{base}/api/prj/projects/{project_id}", timeout=10)
        print("DELETE /api/prj/projects/{id}", res_del.status_code)
    except Exception as e:
        print("WARN: cleanup failed", repr(e))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
