import base64
import datetime as dt
import json
import sys


def _require_requests():
    try:
        import requests  # type: ignore

        return requests
    except Exception as exc:  # pragma: no cover
        print("ERROR: 'requests' is required for this diag script.")
        print("Try: pip install requests")
        raise SystemExit(2) from exc


def main() -> int:
    requests = _require_requests()

    base = "http://127.0.0.1:8080"
    owner_key = "E2E-TEST-TAB63-" + dt.datetime.utcnow().strftime("%Y%m%d%H%M%S")

    print("OWNER_KEY", owner_key)

    # 1) GET empty
    r1 = requests.get(f"{base}/api/cost/opex/hardware-config", params={"owner_key": owner_key}, timeout=10)
    print("GET1 status", r1.status_code)
    r1.raise_for_status()
    j1 = r1.json() or {}
    item1 = j1.get("item") if isinstance(j1, dict) else None
    if not isinstance(item1, dict):
        item1 = {}
    print("GET1 memo", json.dumps(item1.get("memo"), ensure_ascii=False))
    print("GET1 updated_at", item1.get("updated_at"))
    print("GET1 has_diagram", bool(item1.get("diagram")))

    # 2) PUT memo
    r2 = requests.put(
        f"{base}/api/cost/opex/hardware-config",
        json={"owner_key": owner_key, "memo": "memo saved via api"},
        timeout=10,
    )
    print("PUT status", r2.status_code)
    r2.raise_for_status()
    j2 = r2.json() or {}
    item2 = j2.get("item") if isinstance(j2, dict) else None
    if not isinstance(item2, dict):
        item2 = {}
    print("PUT memo", json.dumps(item2.get("memo"), ensure_ascii=False))
    put_updated_at = item2.get("updated_at")
    print("PUT updated_at", put_updated_at)

    # 3) Upload tiny PNG
    png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBAp8l9XcAAAAASUVORK5CYII="
    png_bytes = base64.b64decode(png_b64)

    r_up = requests.post(
        f"{base}/api/uploads",
        files={"file": ("diag.png", png_bytes, "image/png")},
        timeout=20,
    )
    print("UPLOAD status", r_up.status_code)
    r_up.raise_for_status()
    up = r_up.json()
    upload_token = up.get("id")
    if not upload_token:
        raise RuntimeError(f"Upload response missing id: {up!r}")
    print("UPLOAD id", upload_token)

    # 4) Link as DIAGRAM via tab15-files
    payload = {
        "scope_key": "cost_opex_hardware_config",
        "owner_key": owner_key,
        "entry_type": "DIAGRAM",
        "upload_token": upload_token,
        "file_name": up.get("name") or "diag.png",
        "file_size": up.get("size") or len(png_bytes),
        "mime_type": "image/png",
        "is_primary": True,
    }

    r3 = requests.post(
        f"{base}/api/tab15-files",
        json=payload,
        timeout=20,
    )
    print("TAB15 status", r3.status_code)
    r3.raise_for_status()
    j3 = r3.json() or {}
    tab15_item = j3.get("item") if isinstance(j3, dict) else None
    if not isinstance(tab15_item, dict):
        tab15_item = {}
    print("TAB15 id", tab15_item.get("id"))

    # 5) GET again
    r4 = requests.get(f"{base}/api/cost/opex/hardware-config", params={"owner_key": owner_key}, timeout=10)
    print("GET2 status", r4.status_code)
    r4.raise_for_status()
    j4 = r4.json() or {}
    item4 = j4.get("item") if isinstance(j4, dict) else None
    if not isinstance(item4, dict):
        item4 = {}
    print("GET2 memo", json.dumps(item4.get("memo"), ensure_ascii=False))
    print("GET2 updated_at", item4.get("updated_at"))
    diag = item4.get("diagram") or {}
    print("GET2 diagram_download_url", diag.get("download_url"))
    print("GET2 diagram_raw_url", diag.get("raw_url"))

    # sanity: updated_at should be >= put_updated_at (string compare ok for ISO-ish)
    if put_updated_at and item4.get("updated_at") and item4.get("updated_at") < put_updated_at:
        print("WARN: updated_at did not bump as expected")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        raise
