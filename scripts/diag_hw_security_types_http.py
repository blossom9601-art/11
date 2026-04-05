import json
import urllib.request
from collections import Counter


def main() -> None:
    url = "http://127.0.0.1:8080/api/hw-security-types"
    with urllib.request.urlopen(url, timeout=10) as resp:
        body = resp.read().decode("utf-8", "replace")

    data = json.loads(body)
    items = data.get("items", data) if isinstance(data, dict) else data
    if not isinstance(items, list):
        print("NOT_A_LIST", type(items))
        return

    print("status= 200")
    if isinstance(data, dict):
        print("keys=", sorted(list(data.keys())))
        print("total=", data.get("total"))

    print("items_count=", len(items))

    type_key = "security_type"
    counts = Counter((str(it.get(type_key, "")).strip() if isinstance(it, dict) else "") for it in items)
    print("type_counts=", dict(counts))

    ips_rows = [it for it in items if isinstance(it, dict) and str(it.get(type_key, "")).strip().upper() == "IPS"]
    print("ips_rows=", len(ips_rows))
    for it in ips_rows[:5]:
        print("-", it.get("security_code"), repr(it.get("security_type")), it.get("manufacturer_code"), it.get("model_name"))


if __name__ == "__main__":
    main()
