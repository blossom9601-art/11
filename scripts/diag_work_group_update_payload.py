import json
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = "http://127.0.0.1:8080"

def http_json(method: str, path: str, payload=None):
    url = BASE + path
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
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


def main():
    st, lst = http_json("GET", "/api/work-groups")
    print("GET /api/work-groups ->", st)
    items = (lst or {}).get("items") or []
    if not items:
        print("No work groups found; abort")
        return 2

    first = items[0]
    gid = first.get("id") or first.get("group_id")
    if not gid:
        print("Could not find id in first item")
        return 2

    # Use current values (may be codes) and just update note.
    payload = {
        "wc_name": (first.get("wc_name") or first.get("group_name") or "") + "",
        "wc_desc": first.get("wc_desc") or first.get("description") or "",
        "work_status": first.get("work_status") or first.get("status_code") or "",
        "work_division": first.get("work_division") or first.get("division_code") or "",
        "sys_dept": first.get("sys_dept") or first.get("dept_code") or "",
        "work_priority": first.get("work_priority") or first.get("priority") or 0,
        "note": "diag_update_ok",
    }

    st2, out = http_json("PUT", f"/api/work-groups/{gid}", payload)
    print(f"PUT /api/work-groups/{gid} ->", st2)
    print(json.dumps(out, ensure_ascii=False, indent=2)[:2000])

    return 0 if 200 <= st2 < 300 else 1


if __name__ == "__main__":
    raise SystemExit(main())
