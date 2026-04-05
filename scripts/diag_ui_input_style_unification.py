"""UI input style unification diagnostics.

Purpose:
- Prevent repeating the same debugging loop (cache vs CSS scope vs table control sizing).
- Quick checks for:
  - Which detail.css?v=... is loaded on a page
  - Body scope class presence (e.g. page-ad-policy)
  - Existence of key CSS rules for fk-searchable + table compact sizing

Usage (venv):
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/diag_ui_input_style_unification.py

Optional env:
  BLOSSOM_BASE_URL=http://127.0.0.1:8080
  BLOSSOM_DIAG_PATH=/p/gov_ad_policy_account?id=1
"""

from __future__ import annotations

import os
import re
import sys
import urllib.request


def fetch_text(url: str, timeout_s: float = 10.0) -> str:
    with urllib.request.urlopen(url, timeout=timeout_s) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def main() -> int:
    base_url = os.environ.get("BLOSSOM_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
    page_path = os.environ.get("BLOSSOM_DIAG_PATH", "/p/gov_ad_policy_account?id=1")
    page_url = base_url + page_path

    print(f"BASE_URL: {base_url}")
    print(f"PAGE_URL: {page_url}")

    try:
        html = fetch_text(page_url)
    except Exception as exc:
        print(f"ERROR: failed to fetch page: {exc}")
        return 2

    m_css = re.search(r"/static/css/detail\\.css\\?v=[^\"']+", html)
    detail_css_ref = m_css.group(0) if m_css else None
    print(f"detail.css ref in page: {detail_css_ref}")

    # Body scope checks
    for cls in ["page-dns-record", "page-ip-range", "page-ad-policy"]:
        print(f"has body class '{cls}': {cls in html}")

    # Fetch CSS (prefer the exact ref if present)
    css_url = base_url + (detail_css_ref or "/static/css/detail.css")
    try:
        css = fetch_text(css_url)
    except Exception as exc:
        print(f"ERROR: failed to fetch css: {css_url}: {exc}")
        return 3

    def has(pattern: str) -> bool:
        return re.search(pattern, css, flags=re.MULTILINE) is not None

    checks = {
        "form_input_base": has(r"\\.form-input\\{[^}]*padding:12px 16px;[^}]*border:2px"),
        "select_form_input_caret": has(r"select\\.form-input\\{[^}]*background-image:url\\(\"data:image/svg\+xml"),
        "fk_after_disabled": has(r"\\.fk-searchable-control \\.fk-searchable-display::after\\{[^}]*content:none"),
        "fk_has_padding_right_44": "padding-right:44px" in css,
        "ad_table_compact_rules": ("#ad-account-table" in css and "height:36px" in css),
    }

    print("\nCSS checks:")
    for k, v in checks.items():
        print(f"- {k}: {v}")

    failed = [k for k, v in checks.items() if not v]
    if failed:
        print("\nFAIL: missing expected rules:")
        for k in failed:
            print(f"- {k}")
        print("\nHint: if the page looks unchanged, confirm the HTML is loading the expected detail.css?v=... and force-bump if needed.")
        return 1

    print("\nOK: page/css look consistent for input style unification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
