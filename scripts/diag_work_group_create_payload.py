import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"


def get_json(path: str):
    req = urllib.request.Request(BASE + path, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def post_json(path: str, payload: dict):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        data = e.read().decode("utf-8")
        try:
            return e.code, json.loads(data)
        except Exception:
            return e.code, {"raw": data}


def main():
    for path in ("/api/work-statuses", "/api/work-divisions", "/api/org-departments"):
        status, data = get_json(path)
        print(f"GET {path} -> {status}")
        items = data.get("items") or []
        print(" items:", len(items))
        for r in items[:5]:
            print("  ", r)
        print()

    payload = {
        "work_status": "가동",
        "work_division": "ㅋㅋㅋㅋ",
        "sys_dept": "IT인프라운영1팀",
        "wc_name": "UI_DIAG_NAME",
        "wc_desc": "desc",
        "work_priority": 1,
    }
    status, data = post_json("/api/work-groups", payload)
    print("POST /api/work-groups ->", status)
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
