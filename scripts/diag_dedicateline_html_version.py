"""Fetch the dedicatedline list page HTML and verify the JS cache-buster version.

This checks whether the server is actually serving the updated template that references
1.dedicateline_list.js?v=1.0.4.

Run:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_dedicateline_html_version.py
"""

from __future__ import annotations

import re
import urllib.request

URL = "http://127.0.0.1:8080/p/hw_network_dedicateline"


def main() -> int:
    req = urllib.request.Request(URL, headers={"Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        status = getattr(resp, "status", None) or resp.getcode()
        body = resp.read().decode("utf-8", errors="replace")

    print("status=", status)
    # Find the dedicateline_list.js script include.
    m = re.search(r"/static/js/2\.hardware/2-4\.network/2-4-5\.dedicateline/1\.dedicateline_list\.js\?v=([^\"'<>\s]+)", body)
    if not m:
        print("script_tag_not_found")
        print(body[:500])
        return 2

    print("dedicateline_js_v=", m.group(1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
