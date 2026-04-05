import json
import sys
import urllib.error
import urllib.request


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read()
        status = getattr(resp, "status", None) or resp.getcode()
    text = raw.decode("utf-8", "replace")
    try:
        data = json.loads(text)
    except Exception:
        data = None
    return status, text, data


def norm_family(val: object) -> str:
    s = str(val or "").strip()
    return "".join(s.upper().split())


def main() -> int:
    urls = [
        "http://127.0.0.1:8080/api/sw-virtual-types",
        "http://127.0.0.1:8080/api/software/virtualization/kubernetes/assets",
    ]

    for url in urls:
        print(f"URL: {url}")
        try:
            status, text, data = fetch_json(url)
            print(f"STATUS: {status}")
            if data is None:
                print("JSON: (not json)")
                print("BODY_HEAD:", text[:300].replace("\n", " "))
            else:
                if isinstance(data, list):
                    print("JSON: list")
                    print("LEN:", len(data))
                elif isinstance(data, dict):
                    print("JSON: dict")
                    keys = sorted(list(data.keys()))
                    print("KEYS:", ",".join(keys[:30]))
                    if "items" in data and isinstance(data.get("items"), list):
                        print("ITEMS_LEN:", len(data.get("items") or []))
                    if "total" in data:
                        print("TOTAL:", data.get("total"))

                    # Extra insight for the catalog endpoint
                    if url.endswith("/api/sw-virtual-types") and isinstance(data.get("items"), list):
                        counts: dict[str, int] = {}
                        for item in data["items"]:
                            fam = norm_family(item.get("virtual_family") or item.get("hw_type"))
                            counts[fam] = counts.get(fam, 0) + 1
                        for fam in sorted(counts.keys()):
                            print(f"FAMILY[{fam}]: {counts[fam]}")
                        if not counts:
                            print("FAMILY: (no items)")
                else:
                    print("JSON:", type(data).__name__)
        except urllib.error.HTTPError as e:
            print(f"STATUS: {e.code}")
            body = e.read().decode("utf-8", "replace")
            print("BODY_HEAD:", body[:300].replace("\n", " "))
        except Exception as e:
            print("ERROR:", type(e).__name__, str(e)[:200])
        print("---")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
