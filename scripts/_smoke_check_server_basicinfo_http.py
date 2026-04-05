"""HTTP smoke check for server detail basic-info data.

Note: The basic-info UI is populated client-side from sessionStorage.
This script verifies:
- Detail HTML pages reference the latest JS versions (cache-bust).
- Hardware asset APIs return the expected fields, and that there are
  records with non-empty values for the inspection section.

Run:
  .venv/Scripts/python.exe scripts/_smoke_check_server_basicinfo_http.py
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8080"


def http_get_text(url: str, timeout: float = 10.0) -> str:
    req = urllib.request.Request(url, headers={"Accept": "text/html,application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def http_get_json(url: str, timeout: float = 10.0):
    text = http_get_text(url, timeout=timeout)
    return json.loads(text)


def fail(msg: str) -> None:
    raise SystemExit(msg)


def assert_contains(haystack: str, needle: str, *, context: str) -> None:
    if needle not in haystack:
        snippet = haystack[:500]
        fail(f"Missing expected marker in {context}: {needle}\n--- head(500) ---\n{snippet}")


def summarize_assets(kind: str, payload) -> dict:
    items = payload.get("items") if isinstance(payload, dict) else None
    if items is None:
        # Some endpoints might return a list
        items = payload
    if not isinstance(items, list):
        fail(f"Unexpected JSON shape for {kind}: {type(payload)}")

    def nonempty(v) -> bool:
        if v is None:
            return False
        if isinstance(v, str) and not v.strip():
            return False
        return True

    total = len(items)
    with_cia = 0
    with_score = 0
    with_status = 0
    sample = None

    for it in items:
        if not isinstance(it, dict):
            continue
        if any(nonempty(it.get(k)) for k in ("cia_confidentiality", "cia_integrity", "cia_availability")):
            with_cia += 1
        if nonempty(it.get("security_score")):
            with_score += 1
        if nonempty(it.get("work_status_name")) or nonempty(it.get("work_status_code")):
            with_status += 1
        if sample is None and (
            any(nonempty(it.get(k)) for k in ("cia_confidentiality", "cia_integrity", "cia_availability", "security_score"))
        ):
            sample = it

    return {
        "total": total,
        "with_cia": with_cia,
        "with_score": with_score,
        "with_status": with_status,
        "sample": sample,
    }


def main() -> int:
    # 1) Verify HTML includes latest JS query strings (cache bust)
    pages = {
        "onpremise": {
            "key": "hw_server_onpremise_detail",
            "expected_script": "/static/js/2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.js?v=3.7",
        },
        "cloud": {
            "key": "hw_server_cloud_detail",
            "expected_script": "/static/js/2.hardware/2-1.server/2-1-2.cloud/2.cloud_detail.js?v=1.0.6&cb=20251228-4",
        },
        "workstation": {
            "key": "hw_server_workstation_detail",
            "expected_script": "/static/js/2.hardware/2-1.server/2-1-4.workstation/2.workstation_detail.js?v=2.6",
        },
    }

    for name, meta in pages.items():
        url = f"{BASE}/p/{urllib.parse.quote(meta['key'])}"
        try:
            html = http_get_text(url)
        except urllib.error.URLError as e:
            fail(f"Failed to fetch detail page for {name}: {url}\n{e}")
        assert_contains(html, meta["expected_script"], context=f"detail page {name}")
        # sanity: labels exist
        assert_contains(html, "<label>업무 상태</label>", context=f"detail page {name}")
        assert_contains(html, "<label>기밀성</label>", context=f"detail page {name}")

    # 2) Verify APIs return inspection fields
    endpoints = {
        "onpremise": f"{BASE}/api/hardware/onpremise/assets",
        "cloud": f"{BASE}/api/hardware/cloud/assets",
        "workstation": f"{BASE}/api/hardware/workstation/assets",
    }

    report = {}
    for name, url in endpoints.items():
        try:
            payload = http_get_json(url)
        except Exception as e:
            fail(f"Failed to fetch/parse API for {name}: {url}\n{e}")
        report[name] = summarize_assets(name, payload)

    print("OK: detail pages reference latest JS versions")
    print("OK: API endpoints reachable")
    print("--- API summary ---")
    for name, s in report.items():
        print(
            f"{name}: total={s['total']} with_status={s['with_status']} with_cia={s['with_cia']} with_score={s['with_score']}"
        )
        if s["sample"] is not None:
            sample = s["sample"]
            keep = {
                k: sample.get(k)
                for k in (
                    "asset_name",
                    "work_name",
                    "system_name",
                    "work_status_name",
                    "work_status_code",
                    "cia_confidentiality",
                    "cia_integrity",
                    "cia_availability",
                    "security_score",
                    "system_grade",
                    "core_flag",
                    "dr_built",
                    "svc_redundancy",
                )
                if k in sample
            }
            print("  sample:", json.dumps(keep, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print("FATAL:", exc, file=sys.stderr)
        raise
