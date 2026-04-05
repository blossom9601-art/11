import json
import urllib.request


def main() -> None:
    url = "http://127.0.0.1:8080/api/vendor-manufacturers"
    with urllib.request.urlopen(url, timeout=10) as resp:
        body = resp.read().decode("utf-8", "replace")

    data = json.loads(body)
    items = data.get("items", data) if isinstance(data, dict) else data

    print("status= 200")
    if isinstance(data, dict):
        print("keys=", sorted(list(data.keys())))

    print("items_count=", len(items) if isinstance(items, list) else "NOT_A_LIST")
    if isinstance(items, list) and items:
        print("codes=", [it.get("manufacturer_code") for it in items if isinstance(it, dict)])
        print("names=", [it.get("manufacturer_name") for it in items if isinstance(it, dict)])
        print("first=", items[0])


if __name__ == "__main__":
    main()
