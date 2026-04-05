"""Quick HTTP probe for /api/hw-network-types.

Prints status, content-type, and a small preview of body.
Useful when PowerShell Invoke-WebRequest output is flaky.

Run:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_hw_network_types_http.py
"""

from __future__ import annotations

import json
import sys
import urllib.request

URL = "http://127.0.0.1:8080/api/hw-network-types"


def main() -> int:
    req = urllib.request.Request(URL, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = getattr(resp, "status", None) or resp.getcode()
            ctype = resp.headers.get("Content-Type", "")
            raw = resp.read()
    except Exception as exc:
        print("[error]", exc)
        return 2

    print("status=", status)
    print("content-type=", ctype)
    preview = raw[:800].decode("utf-8", errors="replace")
    print("preview=\n" + preview)

    # Try JSON parse if it looks like JSON.
    txt = raw.decode("utf-8", errors="replace")
    try:
        data = json.loads(txt)
    except Exception:
        return 0

    items = data.get("items") if isinstance(data, dict) else None
    if isinstance(items, list):
        print("items_count=", len(items))
        for item in items[:6]:
            nt = item.get("network_type")
            print("-", item.get("network_code"), repr(nt), item.get("manufacturer_code"), item.get("model_name"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
