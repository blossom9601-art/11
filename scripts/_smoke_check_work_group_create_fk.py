import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"


def _get_json(path: str) -> dict:
    req = urllib.request.Request(
        BASE + path,
        method="GET",
        headers={"Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read().decode("utf-8")
    return json.loads(data)


def _post_json(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=body,
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read().decode("utf-8")
    return json.loads(data)


def main() -> int:
    try:
        statuses = _get_json("/api/work-statuses").get("items") or []
        divisions = _get_json("/api/work-divisions").get("items") or []
        depts = _get_json("/api/org-departments").get("items") or []

        if not statuses or not divisions or not depts:
            print("FAIL: missing reference data")
            print(f"statuses={len(statuses)} divisions={len(divisions)} depts={len(depts)}")
            return 2

        status_code = statuses[0].get("status_code") or statuses[0].get("code")
        division_code = divisions[0].get("division_code") or divisions[0].get("wc_code") or divisions[0].get("code")
        dept_code = depts[0].get("dept_code") or depts[0].get("deptCode")

        if not status_code or not division_code or not dept_code:
            print("FAIL: could not extract reference codes")
            print(f"status_code={status_code!r} division_code={division_code!r} dept_code={dept_code!r}")
            return 3

        uniq = int(time.time())
        payload = {
            "wc_name": f"SMOKE_FK_{uniq}",
            "wc_desc": "",
            "work_status": status_code,
            "work_division": division_code,
            "sys_dept": dept_code,
            "work_priority": 1,
            "note": "",
        }

        out = _post_json("/api/work-groups", payload)
        ok = bool(out.get("success", True))
        if not ok:
            print("FAIL: API returned success=false")
            print(json.dumps(out, ensure_ascii=False, indent=2))
            return 4

        item = out.get("item") or {}
        print("OK: created work-group")
        print(f"id={item.get('id')!r} group_name={item.get('group_name') or item.get('wc_name')!r}")
        return 0

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        print(f"HTTPError: {e.code} {e.reason}")
        if body:
            print(body)
        return 10
    except Exception as e:
        print(f"ERROR: {e}")
        return 11


if __name__ == "__main__":
    raise SystemExit(main())
