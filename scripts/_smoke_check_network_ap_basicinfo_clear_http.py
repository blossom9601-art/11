import argparse
import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080"


def _req(method: str, path: str, payload=None, timeout: int = 20):
    url = BASE + path
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, body


def _req_json(method: str, path: str, payload=None):
    status, text = _req(method, path, payload)
    try:
        return status, json.loads(text) if text else None
    except Exception:
        return status, {"_raw": text}


def _log(enabled: bool, msg: str):
    if enabled:
        print(msg)


def _is_wireless_network_type(raw: str) -> bool:
    s = (raw or "").strip().lower()
    if not s:
        return False
    compact = s.replace(" ", "").replace("_", "").replace("-", "")
    if "\ubb34\uc120" in s:
        return True
    if compact == "ap" or compact.startswith("ap"):
        return True
    if "wifi" in compact or "wireless" in compact:
        return True
    return False


def _first(items, pred):
    for it in items or []:
        if isinstance(it, dict) and pred(it):
            return it
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true", help="reduce output")
    args = ap.parse_args()
    verbose = not args.quiet

    checks = []  # (label, passed, detail)

    def ok(label: str, detail: str = ""):
        checks.append((label, True, detail))

    def bad(label: str, detail: str = ""):
        checks.append((label, False, detail))

    ok_all = True
    unique = str(time.time_ns())
    created_id = None

    try:
        # Precondition: work statuses
        st, data = _req_json("GET", "/api/work-statuses")
        if st != 200 or not isinstance(data, dict) or not data.get("success"):
            bad("GET /api/work-statuses", f"status={st} data={data}")
            ok_all = False
            work_status_code = None
        else:
            items = data.get("items") or []
            first_status = _first(items, lambda it: str(it.get("status_code") or "").strip() != "")
            work_status_code = (first_status or {}).get("status_code")
            if not work_status_code:
                bad("pick work_status_code", f"items={len(items)}")
                ok_all = False
            else:
                ok("pick work_status_code", str(work_status_code))

        # Precondition: wireless network model
        st, data = _req_json("GET", "/api/hw-network-types")
        if st != 200 or not isinstance(data, dict) or not data.get("success"):
            bad("GET /api/hw-network-types", f"status={st} data={data}")
            ok_all = False
            net_row = None
        else:
            items = data.get("items") or []
            net_row = _first(items, lambda it: _is_wireless_network_type(it.get("network_type")))
            if not net_row:
                bad("pick wireless hw-network-type", f"items={len(items)}")
                ok_all = False
            else:
                ok(
                    "pick wireless hw-network-type",
                    f"network_code={net_row.get('network_code')} manufacturer_code={net_row.get('manufacturer_code')} network_type={net_row.get('network_type')}",
                )

        # Optional: location pair (center/rack)
        center_code = None
        rack_code = None
        st_r, racks = _req_json("GET", "/api/org-racks")
        if st_r == 200 and isinstance(racks, dict) and racks.get("success"):
            rack = _first(
                racks.get("items") or [],
                lambda it: str(it.get("rack_code") or "").strip() != "" and str(it.get("center_code") or "").strip() != "",
            )
            if rack:
                center_code = rack.get("center_code")
                rack_code = rack.get("rack_code")
                ok("pick rack+center", f"center_code={center_code} rack_code={rack_code}")
            else:
                ok("pick rack+center", "SKIP (no rack items with center_code)")
        else:
            ok("pick rack+center", "SKIP (org-racks endpoint unavailable)")

        # Create AP asset
        if ok_all and work_status_code and net_row:
            create_payload = {
                "asset_code": f"SMOKE-NET-AP-CLEAR-{unique}",
                "asset_name": "SMOKE network ap clear",  # required by service layer
                "work_status": str(work_status_code),
                "work_name": f"SMOKE-WORK-{unique}",
                "system_name": f"SMOKE-SYSTEM-{unique}",
            }
            st, data = _req_json("POST", "/api/hardware/network/ap/assets", create_payload)
            if st != 201 or not isinstance(data, dict) or data.get("success") is not True:
                bad("POST /api/hardware/network/ap/assets", f"status={st} data={data}")
                ok_all = False
            else:
                item = data.get("item") or {}
                created_id = item.get("id")
                if not isinstance(created_id, int):
                    bad("POST /api/hardware/network/ap/assets", f"missing item.id keys={list(item.keys())}")
                    ok_all = False
                else:
                    ok("POST /api/hardware/network/ap/assets", f"id={created_id}")

        # Update: set vendor/model (+ optional location)
        vendor_code = (net_row or {}).get("manufacturer_code")
        model_code = (net_row or {}).get("network_code")
        if ok_all and isinstance(created_id, int):
            update_payload = {
                "vendor": str(vendor_code),
                "model": str(model_code),
            }
            if center_code and rack_code:
                update_payload["center_code"] = str(center_code)
                update_payload["rack_code"] = str(rack_code)

            st, data = _req_json("PUT", f"/api/hardware/network/ap/assets/{created_id}", update_payload)
            if st != 200 or not isinstance(data, dict) or data.get("success") is not True:
                bad("PUT set vendor/model", f"status={st} data={data}")
                ok_all = False
            else:
                ok("PUT set vendor/model", f"vendor={vendor_code} model={model_code}")

        # Verify: values are present
        if ok_all and isinstance(created_id, int):
            st, data = _req_json("GET", f"/api/hardware/network/ap/assets/{created_id}")
            if st != 200 or not isinstance(data, dict) or data.get("success") is not True:
                bad("GET ap asset (after set)", f"status={st} data={data}")
                ok_all = False
            else:
                item = data.get("item") or {}
                got_vendor = item.get("manufacturer_code")
                got_model = item.get("server_code")
                if str(got_vendor or "") != str(vendor_code or ""):
                    bad("verify manufacturer_code", f"expected={vendor_code} got={got_vendor}")
                    ok_all = False
                else:
                    ok("verify manufacturer_code", str(got_vendor))
                if str(got_model or "") != str(model_code or ""):
                    bad("verify server_code", f"expected={model_code} got={got_model}")
                    ok_all = False
                else:
                    ok("verify server_code", str(got_model))

        # Clear: send nulls (this is the bugfix target)
        if ok_all and isinstance(created_id, int):
            clear_payload = {
                "vendor": None,
                "model": None,
                "center_code": None,
                "rack_code": None,
            }
            st, data = _req_json("PUT", f"/api/hardware/network/ap/assets/{created_id}", clear_payload)
            if st != 200 or not isinstance(data, dict) or data.get("success") is not True:
                bad("PUT clear vendor/model/location (null)", f"status={st} data={data}")
                ok_all = False
            else:
                ok("PUT clear vendor/model/location (null)")

        # Verify: cleared fields are actually cleared
        if ok_all and isinstance(created_id, int):
            st, data = _req_json("GET", f"/api/hardware/network/ap/assets/{created_id}")
            if st != 200 or not isinstance(data, dict) or data.get("success") is not True:
                bad("GET ap asset (after clear)", f"status={st} data={data}")
                ok_all = False
            else:
                item = data.get("item") or {}

                def _is_cleared(v) -> bool:
                    return v is None or (isinstance(v, str) and v.strip() == "")

                for k in ("manufacturer_code", "server_code", "center_code", "rack_code"):
                    if not _is_cleared(item.get(k)):
                        bad(f"verify cleared {k}", f"expected empty got={item.get(k)!r}")
                        ok_all = False
                    else:
                        ok(f"verify cleared {k}")

        # Negative: required fields cannot be blanked on update
        if ok_all and isinstance(created_id, int):
            st, data = _req_json("PUT", f"/api/hardware/network/ap/assets/{created_id}", {"work_name": ""})
            if st == 400 and isinstance(data, dict) and data.get("success") is False:
                ok("PUT blank work_name rejected", str(data.get("message") or ""))
            else:
                bad("PUT blank work_name rejected", f"expected 400 got status={st} data={data}")
                ok_all = False

    finally:
        if isinstance(created_id, int):
            _req_json("POST", "/api/hardware/network/ap/assets/bulk-delete", {"ids": [created_id]})

    for label, passed, detail in checks:
        mark = "OK" if passed else "FAIL"
        line = f"[{mark}] {label}"
        if detail:
            line += f" :: {detail}"
        print(line)

    ok_all = ok_all and all(p for _, p, _ in checks)
    return 0 if ok_all else 2


if __name__ == "__main__":
    raise SystemExit(main())
