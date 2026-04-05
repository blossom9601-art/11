import json
import sys
import urllib.error
import urllib.request


def http_json(method: str, url: str, payload=None):
    data = None
    headers = {"Accept": "application/json"}

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "application/json" in ctype:
                return resp.status, json.loads(body.decode("utf-8"))
            return resp.status, body.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            body_text = body.decode("utf-8", "replace")
        except Exception:
            body_text = str(body)
        return e.code, body_text


def resolve_work_group_id(base: str) -> int:
    status, wg = http_json("GET", f"{base}/api/work-groups?page=1&page_size=1")
    print("GET /api/work-groups status", status)

    gid = None
    if isinstance(wg, dict) and wg.get("items"):
        gid = wg["items"][0].get("id")
    elif isinstance(wg, dict) and wg.get("data"):
        gid = wg["data"][0].get("id")
    elif isinstance(wg, dict) and "id" in wg:
        gid = wg.get("id")

    if not gid:
        raise RuntimeError("Could not resolve work_group_id from /api/work-groups response")
    return int(gid)


def main() -> int:
    base = "http://127.0.0.1:8080"

    gid = None
    if len(sys.argv) >= 2:
        try:
            gid = int(sys.argv[1])
        except ValueError:
            print("Usage: python scripts/diag_systems_api_http.py [work_group_id]")
            return 2

    if gid is None:
        gid = resolve_work_group_id(base)

    print("RESOLVED work_group_id", gid)

    status, systems = http_json("GET", f"{base}/api/work-groups/{gid}/systems")
    print("GET /api/work-groups/<id>/systems status", status)

    if isinstance(systems, dict):
        items = systems.get("items") or []
        print("systems.success", systems.get("success"), "total", systems.get("total"), "items_len", len(items))
        if items:
            print("first_system_id", items[0].get("id"))
    else:
        print("systems.body_head", str(systems)[:200])

    status, body = http_json(
        "POST",
        f"{base}/api/work-groups/{gid}/systems",
        {"system_name": "test"},
    )
    print("POST /api/work-groups/<id>/systems status", status)
    if isinstance(body, str):
        print("post.body_head", body[:200])
    else:
        print("post.body_head", str(body)[:200])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
