"""Fetch the dedicated line (회선장비) list page HTML and verify the JS cache-buster.

Run:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_dedicateline_page_html.py
"""

from __future__ import annotations

import re
import urllib.request

URL = "http://127.0.0.1:8080/p/hw_network_dedicateline"


def main() -> int:
    req = urllib.request.Request(URL, headers={"Accept": "text/html"})
    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
    try:
        resp = opener.open(req, timeout=10)
        status = getattr(resp, "status", None) or resp.getcode()
        final_url = getattr(resp, "url", "")
        ctype = resp.headers.get("Content-Type", "")
        body = resp.read().decode("utf-8", errors="replace")
    except Exception as exc:
        print("[error]", exc)
        return 2

    print("status=", status)
    print("final_url=", final_url)
    print("content-type=", ctype)

    # Find the script tag for this page.
    m = re.search(r"/static/js/2\\.hardware/2-4\\.network/2-4-5\\.dedicateline/1\\.dedicateline_list\\.js\\?v=([^\"'&<>\s]+)", body)
    if m:
        print("dedicateline_js_version=", m.group(1))
    else:
        print("dedicateline_js_version= NOT_FOUND")
        # Help debug if we got redirected to login or an error page.
        head = body[:400]
        print("body_head=\n" + head)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
