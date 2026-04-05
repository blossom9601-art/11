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


def _wait_for_server(session: requests.Session, base: str, *, timeout_sec: int = 25) -> None:
    deadline = time.time() + timeout_sec
    last_exc: Exception | None = None
    while time.time() < deadline:
        try:
            r = session.get(f"{base}/login", allow_redirects=True, timeout=5)
            # Any HTTP response means the server is up.
            if r.status_code in (200, 302, 401, 403):
                return
        except Exception as e:  # noqa: BLE001
            last_exc = e
        time.sleep(1)
    raise RuntimeError(f"Server not reachable at {base} within {timeout_sec}s: {last_exc!r}")


def main() -> int:
    base = os.environ.get("BLOSSOM_BASE", "http://127.0.0.1:8080").rstrip("/")
    emp_no = os.environ.get("BLOSSOM_EMP_NO", "ADMIN")
    password = os.environ.get("BLOSSOM_PASSWORD", "Passw0rd")

    s = requests.Session()

    _wait_for_server(s, base)

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
        "project_name": f"SMOKE Tab79 Procurement (TCO) {suffix}",
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

    # 2) Save procurement(tab79) payload: payload.procurement.tco_rows
    tco_rows: List[Dict[str, Any]] = [
        {
            "method": "구매",
            "type": "서버",
            "vendor": "SMOKE_VENDOR",
            "model": f"SMOKE_MODEL_{suffix}",
            "contractor": "SMOKE_CONTRACTOR",
            "contract_type": "일시불",
            "unit_price": "1000000",
            "qty": "2",
            "amount": "2000000",
            "free_months": "12",
            "paid_months": "24",
            "maint_rate": "10",
            "maint_amount": "480000",
            "total": "2480000",
        }
    ]

    tab_payload: Dict[str, Any] = {"procurement": {"tco_rows": tco_rows}}

    res_post = s.post(
        f"{base}/api/prj/projects/{project_id}/tabs/procurement",
        json={"payload": tab_payload},
        timeout=10,
    )
    print("POST /api/prj/projects/{id}/tabs/procurement", res_post.status_code)
    _require(res_post.status_code, expected=201, body=res_post.text)

    created = res_post.json().get("item") or {}
    item_id = created.get("id")
    if not item_id:
        raise RuntimeError(f"Create did not return item.id: {created}")

    # 3) Reload and verify
    res_list = s.get(f"{base}/api/prj/projects/{project_id}/tabs/procurement", timeout=10)
    print("GET /api/prj/projects/{id}/tabs/procurement", res_list.status_code)
    _require(res_list.status_code, expected=200, body=res_list.text)

    data = res_list.json()
    total = data.get("total")
    items = data.get("items") or []
    print("total", total)

    if total != 1 or not items:
        raise RuntimeError(f"Unexpected list response: total={total} items_len={len(items)}")

    payload = (items[0] or {}).get("payload") or {}
    proc = payload.get("procurement") if isinstance(payload, dict) else None
    got_rows = proc.get("tco_rows") if isinstance(proc, dict) else None
    if not (isinstance(got_rows, list) and got_rows):
        raise RuntimeError("Unexpected payload.procurement.tco_rows")

    got_model = (got_rows[0] or {}).get("model")
    if got_model != f"SMOKE_MODEL_{suffix}":
        raise RuntimeError(f"Unexpected model: {got_model!r}")

    print("OK: procurement(tab79 TCO) payload.procurement.tco_rows roundtrip verified")

    # 4) Update and verify (PUT)
    tco_rows2 = [dict(tco_rows[0])]
    tco_rows2[0]["qty"] = "3"
    tab_payload2: Dict[str, Any] = {"procurement": {"tco_rows": tco_rows2}}

    res_put = s.put(
        f"{base}/api/prj/projects/{project_id}/tabs/procurement/{item_id}",
        json={"payload": tab_payload2},
        timeout=10,
    )
    print("PUT /api/prj/projects/{id}/tabs/procurement/{item_id}", res_put.status_code)
    _require(res_put.status_code, expected=200, body=res_put.text)

    res_list2 = s.get(f"{base}/api/prj/projects/{project_id}/tabs/procurement", timeout=10)
    _require(res_list2.status_code, expected=200, body=res_list2.text)
    items2 = res_list2.json().get("items") or []
    payload2 = (items2[-1] or {}).get("payload") or {}
    proc2 = payload2.get("procurement") if isinstance(payload2, dict) else None
    got_rows2 = proc2.get("tco_rows") if isinstance(proc2, dict) else None
    got_qty = ((got_rows2 or [{}])[0] or {}).get("qty") if isinstance(got_rows2, list) else None
    if got_qty != "3":
        raise RuntimeError(f"Unexpected updated qty: {got_qty!r}")

    print("OK: procurement(tab79) PUT verified")

    # Best-effort cleanup
    try:
        res_del = s.delete(f"{base}/api/prj/projects/{project_id}", timeout=10)
        print("DELETE /api/prj/projects/{id}", res_del.status_code)
    except Exception as e:  # noqa: BLE001
        print("WARN: cleanup failed", repr(e))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
