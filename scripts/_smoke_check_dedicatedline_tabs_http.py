"""Smoke-check: Dedicated line tab pages render (HTML) and preserve ?id=.

This verifies the server-side templates and routing for all dedicated-line pages:
- member/customer/van/affiliate/intranet: list + detail tabs (basic/manager/task/log/file)

Run:
  .venv/Scripts/python.exe scripts/_smoke_check_dedicatedline_tabs_http.py
"""

from __future__ import annotations

import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


def _get(client, url: str) -> str:
    resp = client.get(url)
    assert resp.status_code == 200, f"{url} -> {resp.status_code}"
    ctype = (resp.headers.get("Content-Type") or "").lower()
    assert "text/html" in ctype, f"{url} content-type={ctype}"
    return resp.data.decode("utf-8", errors="replace")


def main() -> int:
    from app import create_app

    app = create_app("testing")
    client = app.test_client()

    # Use an arbitrary id; pages are mostly JS-driven and should render regardless.
    test_id = 1

    # Each entry: (list_key, [tab_keys...])
    groups = {
        "member": (
            "gov_dedicatedline_member",
            [
                "gov_dedicatedline_member_detail",
                "gov_dedicatedline_member_manager",
                "gov_dedicatedline_member_task",
                "gov_dedicatedline_member_log",
                "gov_dedicatedline_member_file",
            ],
        ),
        "customer": (
            "gov_dedicatedline_customer",
            [
                "gov_dedicatedline_customer_detail",
                "gov_dedicatedline_customer_manager",
                "gov_dedicatedline_customer_task",
                "gov_dedicatedline_customer_log",
                "gov_dedicatedline_customer_file",
            ],
        ),
        "van": (
            "gov_dedicatedline_van",
            [
                "gov_dedicatedline_van_detail",
                "gov_dedicatedline_van_manager",
                "gov_dedicatedline_van_task",
                "gov_dedicatedline_van_log",
                "gov_dedicatedline_van_file",
            ],
        ),
        "affiliate": (
            "gov_dedicatedline_affiliate",
            [
                "gov_dedicatedline_affiliate_detail",
                "gov_dedicatedline_affiliate_manager",
                "gov_dedicatedline_affiliate_task",
                "gov_dedicatedline_affiliate_log",
                "gov_dedicatedline_affiliate_file",
            ],
        ),
        "intranet": (
            "gov_dedicatedline_intranet",
            [
                "gov_dedicatedline_intranet_detail",
                "gov_dedicatedline_intranet_manager",
                "gov_dedicatedline_intranet_task",
                "gov_dedicatedline_intranet_log",
                "gov_dedicatedline_intranet_file",
            ],
        ),
    }

    total = 0
    ok = 0

    for group_name, (list_key, tab_keys) in groups.items():
        # List page
        html = _get(client, f"/p/{list_key}")
        assert "전용회선" in html or "거버넌스" in html, f"{list_key}: expected dedicated line context"
        ok += 1
        total += 1

        for key in tab_keys:
            url = f"/p/{key}?id={test_id}"
            html = _get(client, url)
            # Must show tab labels
            assert "기본정보" in html, f"{key}: missing tab label"
            assert "담당자" in html, f"{key}: missing tab label"
            assert "작업이력" in html, f"{key}: missing tab label"
            assert "변경이력" in html, f"{key}: missing tab label"
            assert "?id=" in html, f"{key}: expected id propagation"
            ok += 1
            total += 1

        print(f"OK  {group_name}: {1 + len(tab_keys)}/{1 + len(tab_keys)} pages")

    print(f"PASSED: {ok}/{total} dedicatedline pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
