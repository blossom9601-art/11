import json
import sys
import urllib.request

URLS = [
    "http://127.0.0.1:8080/api/hw-server-types",
    "http://127.0.0.1:8080/api/hw-storage-types",
    "http://127.0.0.1:8080/api/hw-san-types",
    "http://127.0.0.1:8080/api/hw-network-types",
    "http://127.0.0.1:8080/api/hw-security-types",
]


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=10) as resp:
        raw = resp.read()
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        data = json.loads(raw)
    return raw, data


def main() -> int:
    for url in URLS:
        try:
            raw, data = fetch_json(url)
        except Exception as e:
            print(f"{url} ERROR {type(e).__name__}: {e}")
            continue

        items = data.get("items") if isinstance(data, dict) else None
        if items is None:
            item_count = None
        else:
            try:
                item_count = len(items)
            except Exception:
                item_count = None

        success = data.get("success") if isinstance(data, dict) else None
        print(
            f"{url.split('/')[-1]} bytes={len(raw)} success={success} items={item_count}"
        )

        if isinstance(items, list) and items:
            sample = items[0]
            if isinstance(sample, dict):
                keys = sorted(sample.keys())
                print(f"  sample_keys={keys}")
            else:
                print(f"  sample_type={type(sample).__name__}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
