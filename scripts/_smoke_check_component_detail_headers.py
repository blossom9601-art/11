"""Smoke check: component detail header query propagation.

Verifies that component detail/tab pages render the given model/vendor
into the page header title/subtitle.

Usage:
  python scripts/_smoke_check_component_detail_headers.py

Optional env vars:
  BLOSSOM_BASE_URL (default: http://127.0.0.1:8080)
"""

from __future__ import annotations

import os
import re
import sys
import urllib.parse
import urllib.request


def fetch(url: str, timeout: float = 10.0) -> str:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        # Flask pages are UTF-8; be tolerant in case of unexpected bytes.
        return r.read().decode("utf-8", "replace")


def main() -> int:
    base = os.environ.get("BLOSSOM_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
    model = "TEST-MODEL-XYZ"
    vendor = "TEST-VENDOR-ABC"

    keys = [
        "cat_component_memory_detail",
        "cat_component_memory_system",
        "cat_component_memory_task",
        "cat_component_memory_log",
        "cat_component_memory_file",
        "cat_component_disk_detail",
        "cat_component_disk_system",
        "cat_component_disk_task",
        "cat_component_disk_log",
        "cat_component_disk_file",
        "cat_component_nic_detail",
        "cat_component_nic_system",
        "cat_component_nic_task",
        "cat_component_nic_log",
        "cat_component_nic_file",
        "cat_component_hba_detail",
        "cat_component_hba_system",
        "cat_component_hba_task",
        "cat_component_hba_log",
        "cat_component_hba_file",
        "cat_component_etc_detail",
        "cat_component_etc_system",
        "cat_component_etc_task",
        "cat_component_etc_log",
        "cat_component_etc_file",
    ]

    re_title = re.compile(
        r"<h1[^>]*id=[\"']page-header-title[\"'][^>]*>\s*"
        + re.escape(model)
        + r"\s*</h1>",
        re.IGNORECASE,
    )
    re_sub = re.compile(
        r"<p[^>]*id=[\"']page-header-subtitle[\"'][^>]*>\s*"
        + re.escape(vendor)
        + r"\s*</p>",
        re.IGNORECASE,
    )

    failures: list[tuple[str, str, str]] = []

    for key in keys:
        url = f"{base}/p/{key}?" + urllib.parse.urlencode({"model": model, "vendor": vendor})
        try:
            html = fetch(url)
        except Exception as e:  # noqa: BLE001
            failures.append((key, url, f"EXC: {e}"))
            continue

        if not (re_title.search(html) and re_sub.search(html)):
            idx = html.find("page-header-title")
            ctx = html[max(0, idx - 200) : idx + 300] if idx >= 0 else html[:500]
            ctx = ctx.replace("\n", "\\n")
            failures.append((key, url, ctx))

    if failures:
        print(f"FAIL: {len(failures)}/{len(keys)}")
        for key, url, ctx in failures:
            print("-", key)
            print("  ", url)
            print("  ", ctx[:300])
        return 1

    print(f"OK: {len(keys)}/{len(keys)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
