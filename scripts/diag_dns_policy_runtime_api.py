import json
import sys
import urllib.error
import urllib.request


BASE = "http://127.0.0.1:8080"


def http_json(method: str, path: str, payload: dict | None = None) -> tuple[int, dict | str]:
    url = f"{BASE}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(body)
            except Exception:
                return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body


def main() -> int:
    # 1) GET list
    status, data = http_json("GET", "/api/network/dns-policies?page=1&page_size=5")
    print("GET /api/network/dns-policies ->", status)
    if not isinstance(data, dict):
        print("Non-JSON response:")
        print(data)
        return 2

    items = data.get("items") or []
    total = data.get("total")
    print("total:", total)
    if items:
        sample = items[0]
        print("sample keys:", sorted(sample.keys()))
        print("sample dns_type:", sample.get("dns_type"))
        print("sample managed_by:", sample.get("managed_by"))
        print("sample ttl:", sample.get("ttl"))
    else:
        print("items empty")

    # 2) POST create with new fields (then GET detail, then DELETE)
    create_payload = {
        "status": "활성",
        "domain": "diag-api.example.com",
        "record_count": 1,
        "dns_type": "Primary",
        "ttl": 3600,
        "managed_by": "Internal",
        "role": "diag",
        "note": "diag runtime api",
    }
    c_status, c_data = http_json("POST", "/api/network/dns-policies", create_payload)
    print("POST /api/network/dns-policies ->", c_status)
    if not isinstance(c_data, dict):
        print("Non-JSON create response:")
        print(c_data)
        return 3

    if not c_data.get("success"):
        print("Create failed payload:")
        print(json.dumps(c_data, ensure_ascii=False, indent=2))
        return 4

    item = c_data.get("item") or {}
    policy_id = item.get("id")
    print("created id:", policy_id)
    print("created dns_type:", item.get("dns_type"))
    print("created managed_by:", item.get("managed_by"))
    print("created ttl:", item.get("ttl"))

    if policy_id is None:
        print("No id returned; cannot verify detail/delete")
        return 5

    d_status, d_data = http_json("GET", f"/api/network/dns-policies/{policy_id}")
    print(f"GET /api/network/dns-policies/{policy_id} ->", d_status)
    if isinstance(d_data, dict):
        di = (d_data.get("item") or {})
        print("detail dns_type:", di.get("dns_type"))
        print("detail managed_by:", di.get("managed_by"))
        print("detail ttl:", di.get("ttl"))
    else:
        print("Non-JSON detail response:")
        print(d_data)

    del_status, del_data = http_json("DELETE", f"/api/network/dns-policies/{policy_id}")
    print(f"DELETE /api/network/dns-policies/{policy_id} ->", del_status)
    if isinstance(del_data, dict):
        print("deleted:", del_data.get("deleted"))
    else:
        print(del_data)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
