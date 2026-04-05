"""Smoke-check: SAN/Network/Security detail pages keep header + querystring across tabs.

Runs without starting the server by using Flask test_client.

What it validates (per category):
- /p/<detail-tab-key>?model=...&vendor=... renders header title/subtitle from query
- Tab nav links include the same querystring (so switching tabs preserves context)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Ensure project root is on sys.path when running this script by file path.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app


def _assert_contains(haystack: str, needle: str, label: str) -> None:
    if needle not in haystack:
        raise AssertionError(f"Missing {label}: expected to find {needle!r}")


def _check_category(client, *, category: str, keys: list[str]) -> None:
    model = f"TEST-{category}-MODEL"
    vendor = f"TEST-{category}-VENDOR"

    qs = f"model={model}&vendor={vendor}&hw_type=TYPE&release_date=2020-01-01&eosl=2030-01-01&qty=3&id=99&note=NOTE"

    for key in keys:
        path = f"/p/{key}?{qs}"
        resp = client.get(path)
        if resp.status_code != 200:
            raise AssertionError(f"{category}: GET {path} -> {resp.status_code}")
        html = resp.get_data(as_text=True)

        # Header should reflect model/vendor (SSR)
        _assert_contains(html, model, f"{category}:{key} model in HTML")
        _assert_contains(html, vendor, f"{category}:{key} vendor in HTML")

        # Tab hrefs should retain the querystring (we check a few key markers)
        # Use regex so ordering of params isn't required, but ensure 'model=' is present.
        # Example: href="/p/cat_hw_network_task?model=...&vendor=..."
        for other_key in keys:
            href_re = re.compile(rf'href="[^"]*/p/{re.escape(other_key)}\?[^"]*model={re.escape(model)}[^"]*vendor={re.escape(vendor)}')
            if not href_re.search(html):
                raise AssertionError(
                    f"{category}:{key} missing query-preserving tab link for {other_key}"
                )


def main() -> None:
    app = create_app()
    with app.test_client() as client:
        _check_category(
            client,
            category="SAN",
            keys=[
                "cat_hw_san_detail",
                "cat_hw_san_system",
                "cat_hw_san_task",
                "cat_hw_san_log",
                "cat_hw_san_file",
            ],
        )
        _check_category(
            client,
            category="NETWORK",
            keys=[
                "cat_hw_network_detail",
                "cat_hw_network_system",
                "cat_hw_network_task",
                "cat_hw_network_log",
                "cat_hw_network_file",
            ],
        )
        _check_category(
            client,
            category="SECURITY",
            keys=[
                "cat_hw_security_detail",
                "cat_hw_security_system",
                "cat_hw_security_task",
                "cat_hw_security_log",
                "cat_hw_security_file",
            ],
        )

    print("OK: SAN/Network/Security detail tabs preserve header + querystring")


if __name__ == "__main__":
    main()
