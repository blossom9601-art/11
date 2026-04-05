import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = "http://127.0.0.1:8080"


def http_json(method: str, path: str, payload=None):
    url = BASE + path
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, method=method, headers=headers)
    try:
        with urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except HTTPError as e:
        raw = e.read().decode("utf-8") if e.fp else ""
        try:
            return e.code, json.loads(raw) if raw else {}
        except Exception:
            return e.code, {"raw": raw}


def main() -> int:
    st, depts = http_json("GET", "/api/org-departments")
    items = (depts or {}).get("items") or []
    print("GET /api/org-departments ->", st, "items=", len(items))
    if not items:
        print("No departments found")
        return 2

    dept_code = items[0].get("dept_code") or items[0].get("deptCode")
    dept_name = items[0].get("dept_name") or items[0].get("deptName")
    print("picked dept:", {"dept_code": dept_code, "dept_name": dept_name})

    st2, wgs = http_json("GET", "/api/work-groups")
    wg_items = (wgs or {}).get("items") or []
    print("GET /api/work-groups ->", st2, "items=", len(wg_items))
    if not wg_items:
        print("No work groups found")
        return 2

    gid = wg_items[0].get("id") or wg_items[0].get("group_id")
    first = wg_items[0]
    payload = {
        "wc_name": (first.get("wc_name") or first.get("group_name") or ""),
        "work_status": (first.get("work_status") or first.get("status_code") or ""),
        "sys_dept": dept_code,
        "note": "dept_change_test",
    }

    st3, out = http_json("PUT", f"/api/work-groups/{gid}", payload)
    print(f"PUT /api/work-groups/{gid} ->", st3)
    print(json.dumps(out, ensure_ascii=False, indent=2)[:2000])

    return 0 if 200 <= st3 < 300 else 1


if __name__ == "__main__":
    raise SystemExit(main())
