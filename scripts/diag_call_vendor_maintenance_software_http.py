from __future__ import annotations

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"
VENDOR_ID = 1


def _req(method: str, path: str, payload: dict | None = None):
    url = BASE + path
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        return e.code, body


def main() -> None:
    status, body = _req("GET", f"/api/vendor-maintenance/{VENDOR_ID}/software")
    print("GET status:", status)
    print(body)


if __name__ == "__main__":
    main()
