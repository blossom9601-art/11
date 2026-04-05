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

    # 1) Create a project
    suffix = int(time.time())
    payload_owned: Dict[str, Any] = {
        "project_name": f"SMOKE Tab77 Communication {suffix}",
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

    # 2) Save communication(tab77) payload
    tab_payload: Dict[str, Any] = {
        "communication": {
            "rows": [
                {
                    "date": "2026-01-04",
                    "time": "10:30",
                    "place": "회의실 A",
                    "type": "정기회의",
                    "category": "주간 회의",
                    "owner": emp_no,
                    "main": f"* agenda\n- item1\n- item2\n※ note {suffix}",
                    "issue": f"No issue {suffix}",
                }
            ]
        }
    }

    res_post = s.post(
        f"{base}/api/prj/projects/{project_id}/tabs/communication",
        json={"payload": tab_payload},
        timeout=10,
    )
    print("POST /api/prj/projects/{id}/tabs/communication", res_post.status_code)
    _require(res_post.status_code, expected=201, body=res_post.text)

    # 3) Reload and verify
    res_list = s.get(f"{base}/api/prj/projects/{project_id}/tabs/communication", timeout=10)
    print("GET /api/prj/projects/{id}/tabs/communication", res_list.status_code)
    _require(res_list.status_code, expected=200, body=res_list.text)

    data = res_list.json()
    total = data.get("total")
    items = data.get("items") or []
    print("total", total)

    if total != 1 or not items:
        raise RuntimeError(f"Unexpected list response: total={total} items_len={len(items)}")

    rows = (((items[0] or {}).get("payload") or {}).get("communication") or {}).get("rows") or []
    got_note = (rows[0] if rows else {}).get("main")
    if not (isinstance(got_note, str) and str(suffix) in got_note):
        raise RuntimeError(f"Unexpected payload main: {got_note!r}")

    print("OK: communication(tab77) payload roundtrip verified")

    # Best-effort cleanup
    try:
        res_del = s.delete(f"{base}/api/prj/projects/{project_id}", timeout=10)
        print("DELETE /api/prj/projects/{id}", res_del.status_code)
    except Exception as e:
        print("WARN: cleanup failed", repr(e))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
