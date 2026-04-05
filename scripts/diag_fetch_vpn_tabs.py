"""Lightweight HTTP check for VPN policy pages.

Designed to avoid PowerShell one-liner/PSReadLine issues by keeping the terminal command short.
"""

from __future__ import annotations

import re
import sys
import urllib.request


URLS = [
    "http://127.0.0.1:8080/p/gov_vpn_policy",
    "http://127.0.0.1:8080/p/gov_vpn_policy2",
    "http://127.0.0.1:8080/p/gov_vpn_policy3",
    "http://127.0.0.1:8080/p/gov_vpn_policy4",
    "http://127.0.0.1:8080/p/gov_vpn_policy5",
]


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "blossom-diag/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        status = getattr(r, "status", 200)
        body = r.read().decode("utf-8", "ignore")
        return status, body


def main() -> int:
    ok = True

    for url in URLS:
        try:
            status, html = fetch(url)
        except Exception as e:
            ok = False
            print(f"{url} -> ERROR: {type(e).__name__}: {e}")
            continue

        has_tabs = ("system-tabs" in html) or ("system-tab-btn" in html)
        # Check that all 5 tab hrefs appear somewhere in the HTML.
        tab_hrefs = [
            "/p/gov_vpn_policy",
            "/p/gov_vpn_policy2",
            "/p/gov_vpn_policy3",
            "/p/gov_vpn_policy4",
            "/p/gov_vpn_policy5",
        ]
        href_missing = [h for h in tab_hrefs if h not in html]

        # Quick check that the per-page JS is referenced (cache-bust param may vary).
        has_page_js = bool(re.search(r"/static/js/4\.governance/4-4\.vpn_policy/.+?/1\.vpn_list\.js\?v=", html))

        if status != 200:
            ok = False

        if not has_tabs:
            ok = False

        if href_missing:
            ok = False

        print(
            f"{url} -> {status} | tabs:{has_tabs} | js:{has_page_js} | missing_hrefs:{len(href_missing)}"
        )

    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
