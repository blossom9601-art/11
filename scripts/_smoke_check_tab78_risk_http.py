import os
import time
from typing import Any, Dict, List

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
        "project_name": f"SMOKE Tab78 Risk (FMEA) {suffix}",
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

    # Save risk(tab78) payload: payload.risk.fmea_rows
    fmea_rows: List[Dict[str, Any]] = [
        {
            "process": f"공정-{suffix}",
            "failure": "고장형태-A",
            "effect": "영향-A",
            "s": "3",
            "o": "2",
            "d": "4",
            "rpn": str(3 * 2 * 4),
            "owner": emp_no,
            "status": "진행",
        }
    ]

    res_post = s.post(
        f"{base}/api/prj/projects/{project_id}/tabs/risk",
        json={"payload": {"risk": {"fmea_rows": fmea_rows}}},
        timeout=10,
    )
    print("POST /api/prj/projects/{id}/tabs/risk", res_post.status_code)
    _require(res_post.status_code, expected=201, body=res_post.text)

    created = res_post.json().get("item") or {}
    item_id = created.get("id")
    if not item_id:
        raise RuntimeError(f"Create did not return item.id: {created}")

    res_list = s.get(f"{base}/api/prj/projects/{project_id}/tabs/risk", timeout=10)
    print("GET /api/prj/projects/{id}/tabs/risk", res_list.status_code)
    _require(res_list.status_code, expected=200, body=res_list.text)

    data = res_list.json()
    total = data.get("total")
    items = data.get("items") or []
    print("total", total)

    if total != 1 or not items:
        raise RuntimeError(f"Unexpected list response: total={total} items_len={len(items)}")

    payload = (items[0] or {}).get("payload") or {}
    got_rows = None
    if isinstance(payload, dict):
        risk = payload.get("risk")
        if isinstance(risk, dict):
            got_rows = risk.get("fmea_rows")

    if not isinstance(got_rows, list) or not got_rows:
        raise RuntimeError(f"Unexpected payload.risk.fmea_rows: {got_rows!r}")

    got_process = (got_rows[0] or {}).get("process")
    if got_process != f"공정-{suffix}":
        raise RuntimeError(f"Unexpected first row process: {got_process!r}")

    print("OK: risk(tab78 FMEA) payload.risk.fmea_rows roundtrip verified")

    # Update (PUT) and verify
    fmea_rows2: List[Dict[str, Any]] = [
        {
            "process": f"공정-{suffix}-U",
            "failure": "고장형태-B",
            "effect": "영향-B",
            "s": "5",
            "o": "1",
            "d": "2",
            "rpn": str(5 * 1 * 2),
            "owner": emp_no,
            "status": "완료",
        }
    ]

    res_put = s.put(
        f"{base}/api/prj/projects/{project_id}/tabs/risk/{item_id}",
        json={"payload": {"risk": {"fmea_rows": fmea_rows2}}},
        timeout=10,
    )
    print("PUT /api/prj/projects/{id}/tabs/risk/{item_id}", res_put.status_code)
    _require(res_put.status_code, expected=200, body=res_put.text)

    res_list2 = s.get(f"{base}/api/prj/projects/{project_id}/tabs/risk", timeout=10)
    _require(res_list2.status_code, expected=200, body=res_list2.text)
    items2 = res_list2.json().get("items") or []
    payload2 = (items2[-1] or {}).get("payload") or {}

    got_rows2 = None
    if isinstance(payload2, dict):
        risk2 = payload2.get("risk")
        if isinstance(risk2, dict):
            got_rows2 = risk2.get("fmea_rows")

    got_process2 = (got_rows2[0] or {}).get("process") if isinstance(got_rows2, list) and got_rows2 else None
    if got_process2 != f"공정-{suffix}-U":
        raise RuntimeError(f"Unexpected updated process: {got_process2!r}")

    print("OK: risk(tab78 FMEA) PUT verified")

    try:
        res_del = s.delete(f"{base}/api/prj/projects/{project_id}", timeout=10)
        print("DELETE /api/prj/projects/{id}", res_del.status_code)
    except Exception as e:
        print("WARN: cleanup failed", repr(e))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
